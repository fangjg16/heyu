/**
 * 从 R2 session 仅重跑 publishing（Job 938d970f 等）
 * 用法：cd api-worker && npx tsx scripts/run-slot-batch-resume-publish.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  countEmptyHtmlCells,
  countEmptyHtmlRows,
} from "../src/knowledge-network-content-row-quality.ts";
import { validateFullStructuredKbQuality } from "../src/knowledge-network-full-quality-contract.ts";
import { CANONICAL_KB_SLOTS } from "../src/knowledge-network-html-validation.ts";
import { validateKnowledgeNetworkHtmlForWrite } from "../src/knowledge-network-html-validation.ts";
import { extractStructuredKbDataFromAnswer } from "../src/knowledge-network-structured-kb-data.ts";

const BASE = (process.env.JFO_API_BASE ?? "https://jfo-api.jfo-api.workers.dev").replace(/\/$/, "");
const PROJECT_ID = process.env.JFO_PROJECT_ID ?? "proj-7c0f947a6a00";
const USER_ID = process.env.JFO_USER_ID ?? "jensen-fang";
const JOB_ID = process.env.JFO_JOB_ID ?? "938d970f-af77-4bf5-aa66-5bb709c99cb2";
const POLL_MS = 5_000;
const MAX_WAIT_MS = 12 * 60_000;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function versionFromHtml(html: string): string | null {
  return html.match(/<dt>\s*Version\s*<\/dt>\s*<dd>([^<]+)<\/dd>/i)?.[1]?.trim() ?? null;
}

function maturityFromHtml(html: string): { a: string; b: string; combined: string } {
  const pick = (cls: string) =>
    html.match(new RegExp(`stat-item-${cls}[\\s\\S]*?class=["']stat-value["'][^>]*>([^<]+)`, "i"))?.[1]?.trim() ??
    "—";
  return { a: pick("a"), b: pick("b"), combined: pick("c") };
}

function qualityCoverageFromHtml(html: string): string | null {
  return (
    html.match(/structure-coverage-debug:\s*(\d+)/i)?.[1] ??
    html.match(/quality-coverage:\s*(\d+)/i)?.[1] ??
    null
  );
}

function sectionHtml(html: string, id: string): string {
  return html.match(new RegExp(`<section[^>]*\\bid=["']${id}["'][^>]*>[\\s\\S]*?<\\/section>`, "i"))?.[0] ?? "";
}

function analyzeHtml(html: string) {
  const strict = validateKnowledgeNetworkHtmlForWrite(html, { mode: "full" });
  const slotsPresent = CANONICAL_KB_SLOTS.filter((s) => sectionHtml(html, s).length > 0);
  const appendices = ["source-index", "glossary", "data-dictionary", "version-ledger"].map((id) => ({
    id,
    ok: new RegExp(`id=["']${id}["']`, "i").test(html),
  }));
  const citeRefs = [...html.matchAll(/href=["']#(source-[^"']+)["']/gi)].map((m) => m[1]!);
  const appendixIds = [...html.matchAll(/id=["'](source-[^"']+)["']/gi)].map((m) => m[1]!);
  const appendixSet = new Set(appendixIds);
  const brokenCites = [...new Set(citeRefs)].filter((id) => !appendixSet.has(id));

  return {
    strictPass: strict.ok,
    htmlBytes: html.length,
    emptyTbodyRows: countEmptyHtmlRows(html),
    emptyTdCells: countEmptyHtmlCells(html),
    slotsPresent: slotsPresent.length,
    appendices,
    appendicesAllPresent: appendices.every((a) => a.ok),
    citationRefs: citeRefs.length,
    brokenCitationTargets: brokenCites,
    citationsOk: brokenCites.length === 0 && citeRefs.length > 0,
    versionDisplay: versionFromHtml(html),
    qualityCoverage: qualityCoverageFromHtml(html),
    maturity: maturityFromHtml(html),
    versionLedgerRows: (html.match(/id=["']version-ledger["'][\s\S]*?<tbody/gi) ?? []).length > 0
      ? (sectionHtml(html, "version-ledger").match(/<tr>/gi) ?? []).length
      : 0,
  };
}

async function main() {
  const t0 = Date.now();
  console.log("=== Slot-Batch Resume Publish ===");
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Job: ${JOB_ID}\n`);

  const knBeforeRes = await fetch(
    `${BASE}/api/projects/${encodeURIComponent(PROJECT_ID)}/knowledge-network?userId=${encodeURIComponent(USER_ID)}`,
  );
  const knBefore = knBeforeRes.ok
    ? ((await knBeforeRes.json()) as { meta?: { version?: number; lastJobId?: string | null } })
    : {};
  const versionBefore = knBefore.meta?.version ?? null;

  const startRes = await fetch(
    `${BASE}/api/projects/${encodeURIComponent(PROJECT_ID)}/knowledge-network/slot-batch-resume-publish?userId=${encodeURIComponent(USER_ID)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID }),
    },
  );
  const startBody = (await startRes.json()) as Record<string, unknown>;
  if (!startRes.ok) {
    console.error("Start failed:", startRes.status, startBody);
    process.exit(1);
  }
  console.log("resume-publish started:", JSON.stringify(startBody, null, 2));

  let lastPoll: Record<string, unknown> = {};

  while (Date.now() - t0 < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    const pollRes = await fetch(
      `${BASE}/api/agent-jobs/${encodeURIComponent(JOB_ID)}?userId=${encodeURIComponent(USER_ID)}`,
    );
    const poll = (await pollRes.json()) as Record<string, unknown>;
    lastPoll = poll;
    const sb = poll.slotBatchProgress as Record<string, unknown> | undefined;
    const wall = Math.round((Date.now() - t0) / 1000);
    console.log(
      `[${wall}s] status=${poll.status} · step=${sb?.currentPublishStep ?? "?"} · error=${poll.error ?? "—"}`,
    );
    if (poll.status === "completed" || poll.status === "failed") break;
  }

  const status = String(lastPoll.status ?? "timeout");
  const answer = String(lastPoll.answer ?? "");
  const sb = lastPoll.slotBatchProgress as Record<string, unknown> | undefined;

  const knAfterRes = await fetch(
    `${BASE}/api/projects/${encodeURIComponent(PROJECT_ID)}/knowledge-network?userId=${encodeURIComponent(USER_ID)}`,
  );
  const knAfter = knAfterRes.ok
    ? ((await knAfterRes.json()) as {
        meta?: { version?: number; versionLabel?: string; lastJobId?: string | null };
        html?: string;
      })
    : {};
  const versionAfter = knAfter.meta?.version ?? null;
  const html = knAfter.html ?? String(lastPoll.knowledgeNetworkHtml ?? "");

  const publishSucceeded =
    status === "completed" &&
    versionAfter !== null &&
    versionAfter !== versionBefore &&
    knAfter.meta?.lastJobId === JOB_ID;

  const report: Record<string, unknown> = {
    projectId: PROJECT_ID,
    jobId: JOB_ID,
    resumePublishOnly: true,
    status,
    publishSucceeded,
    wallSec: Math.round((Date.now() - t0) / 1000),
    versionBefore,
    versionAfter,
    versionLabelAfter: knAfter.meta?.versionLabel ?? null,
    d1LastJobId: knAfter.meta?.lastJobId ?? null,
    kbPreservedOnFailure: status === "failed" && versionAfter === versionBefore,
    publishStep: sb?.currentPublishStep ?? null,
    publishError: sb?.publishError ?? lastPoll.error ?? null,
    assembledHtmlBytes: sb?.assembledHtmlBytes ?? null,
    chatSync: {
      jobCompleted: status === "completed",
      hasAnswer: answer.length > 0,
      hasKnowledgeNetworkHtml: Boolean(lastPoll.knowledgeNetworkHtml || html),
      answerPreview: answer.slice(0, 200),
    },
    error: lastPoll.error ?? null,
  };

  if (html && publishSucceeded) {
    const htmlAnalysis = analyzeHtml(html);
    report.htmlAnalysis = htmlAnalysis;
    report.publishSummary = {
      factorA: htmlAnalysis.maturity.a,
      factorB: htmlAnalysis.maturity.b,
      combined: htmlAnalysis.maturity.combined,
      qualityCoverage: htmlAnalysis.qualityCoverage,
      htmlBytes: htmlAnalysis.htmlBytes,
      emptyTbodyRows: htmlAnalysis.emptyTbodyRows,
      emptyTdCells: htmlAnalysis.emptyTdCells,
      appendicesAD: htmlAnalysis.appendices,
      appendicesAllPresent: htmlAnalysis.appendicesAllPresent,
      citationsOk: htmlAnalysis.citationsOk,
      citationRefs: htmlAnalysis.citationRefs,
      versionLedgerPresent: htmlAnalysis.appendices.find((a) => a.id === "version-ledger")?.ok ?? false,
      versionLedgerRowCount: htmlAnalysis.versionLedgerRows,
    };

    const extracted = extractStructuredKbDataFromAnswer(answer);
    if (extracted.ok) {
      const q = validateFullStructuredKbQuality(extracted.data);
      report.structuredQuality = {
        richContractMet: q.richContractMet,
        gapFirstPublishOk: q.gapFirstPublishOk,
        coverageScore: q.coverageScore,
        publishCoverage: q.publishCoverage,
        ok: q.ok,
      };
    }
  }

  const outPath = join(process.cwd(), "slot-batch-resume-publish-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n=== Resume Publish Report ===");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n报告已写入 ${outPath}`);

  if (!publishSucceeded) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
