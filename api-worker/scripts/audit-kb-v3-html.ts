/**
 * v3 KB HTML 质量审计（本地或 API 拉取）
 * 用法：cd api-worker && npx tsx scripts/audit-kb-v3-html.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  countEmptyHtmlCells,
  countEmptyHtmlRows,
} from "../src/knowledge-network-content-row-quality.ts";
import { buildCodexParityAuditJson } from "../src/knowledge-network-codex-parity.ts";
import { CANONICAL_KB_SLOTS } from "../src/knowledge-network-html-validation.ts";
import { validateKnowledgeNetworkHtmlForWrite } from "../src/knowledge-network-html-validation.ts";

const BASE = (process.env.JFO_API_BASE ?? "https://jfo-api.jfo-api.workers.dev").replace(/\/$/, "");
const PROJECT_ID = process.env.JFO_PROJECT_ID ?? "proj-7c0f947a6a00";
const USER_ID = process.env.JFO_USER_ID ?? "jensen-fang";

function sectionHtml(html: string, id: string): string {
  return html.match(new RegExp(`<section[^>]*\\bid=["']${id}["'][^>]*>[\\s\\S]*?<\\/section>`, "i"))?.[0] ?? "";
}

function maturityFromHtml(html: string): { factorA: string; factorB: string; combined: string } {
  const pick = (cls: string) =>
    html.match(new RegExp(`stat-item-${cls}[\\s\\S]*?class=["']stat-value["'][^>]*>([^<]+)`, "i"))?.[1]?.trim() ??
    "—";
  return { factorA: pick("a"), factorB: pick("b"), combined: pick("c") };
}

function versionFromHtml(html: string): string | null {
  return html.match(/<dt>\s*Version\s*<\/dt>\s*<dd>([^<]+)<\/dd>/i)?.[1]?.trim() ?? null;
}

function locateEmptyTd(html: string): { section: string; count: number; samples: string[] }[] {
  const out: { section: string; count: number; samples: string[] }[] = [];
  const scan = (label: string, chunk: string) => {
    const samples: string[] = [];
    let count = 0;
    for (const m of chunk.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const row = m[1]!;
      if (row.includes("<th")) continue;
      for (const c of row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)) {
        const inner = c[1]!.replace(/<[^>]+>/g, "").trim();
        if (!inner || /^[-—–]$/.test(inner)) {
          count += 1;
          if (samples.length < 3) samples.push(row.slice(0, 120).replace(/\s+/g, " "));
        }
      }
    }
    if (count > 0) out.push({ section: label, count, samples });
  };

  scan("header/masthead", html.match(/<header[\s\S]*?<\/header>/i)?.[0] ?? "");
  for (const slot of CANONICAL_KB_SLOTS) {
    const sec = sectionHtml(html, slot);
    if (sec) scan(slot, sec);
  }
  for (const id of ["source-index", "glossary", "data-dictionary", "version-ledger"]) {
    const sec = sectionHtml(html, id);
    if (sec) scan(`appendix:${id}`, sec);
  }
  return out.sort((a, b) => b.count - a.count);
}

function qualityCoverageFromHtml(html: string): string | null {
  return (
    html.match(/structure-coverage-debug:\s*(\d+)/i)?.[1] ??
    html.match(/quality-coverage:\s*(\d+)/i)?.[1] ??
    null
  );
}

function detailsTopicCount(html: string): number {
  return (html.match(/details\.topic/gi) ?? []).length;
}

function riskBadgeCount(html: string): number {
  return (html.match(/risk-level-(critical|high|medium|low)/gi) ?? []).length;
}

function timelineSubtitleOk(html: string): boolean {
  const sec = sectionHtml(html, "timeline-milestones");
  return /仅记录项目自身节点|PROJECT TIMELINE/i.test(sec);
}

async function fetchHtml(): Promise<{ html: string; meta: Record<string, unknown> }> {
  const res = await fetch(
    `${BASE}/api/projects/${encodeURIComponent(PROJECT_ID)}/knowledge-network?userId=${encodeURIComponent(USER_ID)}`,
  );
  if (!res.ok) throw new Error(`KN fetch failed: ${res.status}`);
  const body = (await res.json()) as { html?: string; meta?: Record<string, unknown> };
  if (!body.html) throw new Error("No html in response");
  return { html: body.html, meta: body.meta ?? {} };
}

async function main() {
  console.log("=== KB v3 HTML Audit ===\n");
  const { html, meta } = await fetchHtml();
  const strict = validateKnowledgeNetworkHtmlForWrite(html, { mode: "full" });

  const citeRefs = [...html.matchAll(/href=["']#(source-[^"']+)["']/gi)].map((m) => m[1]!);
  const appendixIds = [...html.matchAll(/id=["'](source-[^"']+)["']/gi)].map((m) => m[1]!);
  const appendixSet = new Set(appendixIds);
  const brokenCites = [...new Set(citeRefs)].filter((id) => !appendixSet.has(id));

  const emptyTdBySection = locateEmptyTd(html);
  const maturity = maturityFromHtml(html);
  const pageVersion = versionFromHtml(html);
  const d1Version = meta.version != null ? `v${meta.version}` : null;

  const codexParity = buildCodexParityAuditJson(html);

  const report = {
    projectId: PROJECT_ID,
    auditedAt: new Date().toISOString(),
    codexParity,
    htmlBytes: html.length,
    strictPass: strict.ok,
    strictIssues: strict.issues?.slice(0, 10) ?? [],
    d1Version,
    pageVersion,
    versionLabel: meta.versionLabel ?? null,
    versionConsistent: pageVersion === d1Version || pageVersion === meta.versionLabel,
    qualityCoverage: qualityCoverageFromHtml(html),
    maturity,
    maturityNumeric:
      maturity.factorA !== "—" && /^\d+%?$/.test(maturity.factorA.replace("%", "")),
    emptyTbodyRows: countEmptyHtmlRows(html),
    emptyTdCells: countEmptyHtmlCells(html),
    emptyTdBySection,
    appendices: ["source-index", "glossary", "data-dictionary", "version-ledger"].map((id) => ({
      id,
      present: Boolean(sectionHtml(html, id)),
    })),
    citations: { refs: citeRefs.length, broken: brokenCites },
    detailsTopicMentions: detailsTopicCount(html),
    riskLevelBadges: riskBadgeCount(html),
    timelineProjectOnly: timelineSubtitleOk(html),
    slotsPresent: CANONICAL_KB_SLOTS.filter((s) => sectionHtml(html, s).length > 0).length,
  };

  const outPath = join(process.cwd(), "kb-v3-audit-report.json");
  const parityPath = join(process.cwd(), "codex-parity-audit.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(parityPath, JSON.stringify(codexParity, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n报告已写入 ${outPath}`);
  console.log(`Codex parity JSON 已写入 ${parityPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
