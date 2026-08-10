/**
 * PET v6 离线验证：对比 live HTML vs 修复后 re-render JSON
 * 用法：cd api-worker && npx tsx scripts/validate-pet-v6-offline.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  countEmptyHtmlCells,
  countEmptyHtmlRows,
} from "../src/knowledge-network-content-row-quality.ts";
import { computeDeterministicMaturity } from "../src/knowledge-network-deterministic-maturity.ts";
import { validateFullStructuredKbQuality } from "../src/knowledge-network-full-quality-contract.ts";
import { CANONICAL_KB_SLOTS } from "../src/knowledge-network-html-validation.ts";
import { validateKnowledgeNetworkHtmlForWrite } from "../src/knowledge-network-html-validation.ts";
import {
  extractStructuredKbDataFromJson,
  renderStructuredKbDataToHtml,
} from "../src/knowledge-network-structured-kb-data.ts";
import { SLOT_TABLE_FIELDS } from "../src/knowledge-network-row-columns.ts";

const here = dirname(fileURLToPath(import.meta.url));
const v6JsonPath = join(here, "fixtures/pet-v6-structured-kb-data.json");
const v6LiveHtmlPath = join(here, "fixtures/pet-v6-live.html");

const TARGET_SLOTS = [
  "target-overview",
  "industry-market",
  "business-operations",
  "legal-ownership",
  "regulatory-compliance",
  "decision-framework",
] as const;

const TARGET_FIELDS = [
  "keyClaims",
  "valueChain",
  "policyContext",
  "revenueTree",
  "customerBuyer",
  "pricing",
  "supplyChain",
  "contractRights",
  "licenseRequirements",
  "goNoGoConditions",
] as const;

function extractSection(html: string, slotId: string): string {
  const re = new RegExp(
    `<section[^>]*\\bid=["']${slotId}["'][^>]*>[\\s\\S]*?<\\/section>`,
    "i",
  );
  return html.match(re)?.[0] ?? "";
}

function countFullyEmptyTbodyRows(html: string): number {
  let count = 0;
  for (const tbody of html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/gi)) {
    const body = tbody[1] ?? "";
    for (const tr of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const row = tr[1] ?? "";
      if (row.includes("<th")) continue;
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
        c[1]!.replace(/<[^>]+>/g, "").trim(),
      );
      if (cells.length > 0 && cells.every((c) => !c)) count += 1;
    }
  }
  return count;
}

function versionFromHtml(html: string): string | null {
  const m = html.match(/<dt>\s*Version\s*<\/dt>\s*<dd>([^<]+)<\/dd>/i);
  return m?.[1]?.trim() ?? null;
}

function aiBadgeFromHtml(html: string): string | null {
  const m = html.match(/AI-Generated · ([^<]+)/i);
  return m?.[1]?.trim() ?? null;
}

function auditHtml(label: string, html: string) {
  const sections = CANONICAL_KB_SLOTS.map((slot) => ({
    slot,
    section: extractSection(html, slot),
  }));
  const emptyRowsTotal = countFullyEmptyTbodyRows(html);
  const emptyCellsTotal = sections.reduce(
    (n, s) => n + countEmptyHtmlCells(s.section),
    0,
  );
  const targetAudit = TARGET_SLOTS.map((slot) => {
    const section = extractSection(html, slot);
    return {
      slot,
      emptyRows: countEmptyHtmlRows(section),
      emptyCells: countEmptyHtmlCells(section),
      mappingWarnings: (section.match(/字段映射警告/g) ?? []).length,
      gapCallouts: (section.match(/callout warning/g) ?? []).length,
    };
  });

  console.log(`\n=== ${label} ===`);
  console.log(`Version masthead: ${versionFromHtml(html) ?? "(missing)"}`);
  console.log(`AI badge: ${aiBadgeFromHtml(html) ?? "(missing)"}`);
  console.log(`全页空 tbody row: ${emptyRowsTotal}`);
  console.log(`全页空/占位 td: ${emptyCellsTotal}`);
  console.log("目标 slot 审计:");
  for (const t of targetAudit) {
    console.log(
      `  ${t.slot}: emptyRows=${t.emptyRows} emptyCells=${t.emptyCells} mappingWarnings=${t.mappingWarnings}`,
    );
  }
  return { emptyRowsTotal, emptyCellsTotal, targetAudit, version: versionFromHtml(html) };
}

function main() {
  const jsonRaw = readFileSync(v6JsonPath, "utf8");
  const liveHtml = readFileSync(v6LiveHtmlPath, "utf8");

  const extracted = extractStructuredKbDataFromJson(jsonRaw);
  if (!extracted.ok) {
    console.error("JSON extract failed:", extracted.reason);
    process.exit(1);
  }

  const quality = validateFullStructuredKbQuality(extracted.data);
  const maturity = computeDeterministicMaturity(extracted.data);
  const rendered = renderStructuredKbDataToHtml(extracted.data, { versionDisplay: "6" });

  if (!rendered.ok) {
    console.error("Render failed:", rendered.reason);
    process.exit(1);
  }

  const strict = validateKnowledgeNetworkHtmlForWrite(rendered.html, {
    mode: "full",
    strict: true,
    browserUpload: false,
  });

  console.log("=== Quality Contract (v6 JSON) ===");
  console.log(`coverageScore: ${quality.coverageScore}`);
  console.log(`publishCoverage: ${quality.publishCoverage}`);
  console.log(`richContractMet: ${quality.richContractMet}`);
  console.log(`contract ok: ${quality.ok}`);
  console.log(`emptyRowIssues: ${quality.emptyRowIssues.length}`);
  console.log(`unmappedRowIssues: ${quality.unmappedRowIssues.length}`);
  if (quality.unmappedRowIssues.length) {
    console.log("  sample:", quality.unmappedRowIssues.slice(0, 5).map((u) => u.path).join(", "));
  }
  if (quality.emptyRowIssues.length) {
    console.log("  sample:", quality.emptyRowIssues.slice(0, 5).map((e) => e.path).join(", "));
  }

  console.log("\n=== Deterministic Maturity ===");
  console.log(`Factor A: ${maturity.factorA}% (cap 单一BP ≤50)`);
  console.log(`Factor B: ${maturity.factorB}%`);
  console.log(`Combined: ${maturity.combined}%`);
  console.log(`Note A: ${maturity.factorANote}`);

  console.log("\n=== Alias coverage (SLOT_TABLE_FIELDS) ===");
  for (const slot of TARGET_SLOTS) {
    const fields = SLOT_TABLE_FIELDS[slot] ?? [];
    console.log(`  ${slot}: ${fields.map((f) => f.field).join(", ") || "(none)"}`);
  }

  const live = auditHtml("v6 LIVE HTML (修复前 Worker 渲染)", liveHtml);
  const fixed = auditHtml("v6 RE-RENDER (修复后离线)", rendered.html);

  console.log("\n=== Strict HTML validation (re-render) ===");
  console.log(`strict pass: ${strict.ok}${strict.ok ? "" : ` — ${strict.error}`}`);

  console.log("\n=== Delta summary ===");
  console.log(
    `空 tbody row: ${live.emptyRowsTotal} → ${fixed.emptyRowsTotal} (${fixed.emptyRowsTotal - live.emptyRowsTotal >= 0 ? "+" : ""}${fixed.emptyRowsTotal - live.emptyRowsTotal})`,
  );
  console.log(
    `空/占位 td: ${live.emptyCellsTotal} → ${fixed.emptyCellsTotal} (${fixed.emptyCellsTotal - live.emptyCellsTotal >= 0 ? "+" : ""}${fixed.emptyCellsTotal - live.emptyCellsTotal})`,
  );
  console.log(`Version: ${live.version} → ${fixed.version}`);

  const checks = [
    ["Factor A ≤ 50", parseInt(maturity.factorA, 10) <= 50],
    ["re-render 无全空 tbody row", fixed.emptyRowsTotal === 0],
    ["空 td 显著下降", fixed.emptyCellsTotal < live.emptyCellsTotal],
    ["Version 显示 v6", fixed.version === "v6"],
    ["schema 不在 Version 字段", !fixed.version?.includes("2.91")],
    ["strict HTML pass", strict.ok],
    ["无 unmapped rows", quality.unmappedRowIssues.length === 0],
    ["无 empty row issues", quality.emptyRowIssues.length === 0],
  ] as const;

  console.log("\n=== Acceptance checks ===");
  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failed += 1;
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
