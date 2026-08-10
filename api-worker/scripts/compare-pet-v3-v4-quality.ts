/**
 * PET v3 vs v4 质量对比诊断
 * npx tsx scripts/compare-pet-v3-v4-quality.ts
 */
import { readFileSync } from "node:fs";
import { CANONICAL_KB_SLOTS } from "../src/knowledge-network-html-validation.ts";

const v3Path =
  "c:/Users/jensenfang/Downloads/[AI]_proj-87c4b0718f58_知识网络_v3.html";
const v4Path =
  "c:/Users/jensenfang/Downloads/[AI]_proj-87c4b0718f58_知识网络_v4.html";

type SlotMetrics = {
  slot: string;
  sectionChars: number;
  tableRows: number;
  callouts: number;
  citeRefs: number;
  h3Count: number;
  hasJourney: boolean;
  hasScenarioCards: boolean;
  hasRiskMatrix: boolean;
  hasTimelineBlocks: boolean;
  hasDecisionCallout: boolean;
  hasGapCallout: boolean;
};

function extractSection(html: string, slot: string): string {
  const re = new RegExp(
    `<section[^>]*\\bid=["']${slot}["'][^>]*>([\\s\\S]*?)<\\/section>`,
    "i",
  );
  return html.match(re)?.[1] ?? "";
}

function countTableRows(section: string): number {
  return (section.match(/<tr[\s>]/gi) ?? []).length;
}

function countCallouts(section: string): number {
  return (section.match(/class=["'][^"']*callout/gi) ?? []).length;
}

function countCiteRefs(section: string): number {
  return (section.match(/href=["']#source-/gi) ?? []).length;
}

function analyzeSlot(html: string, slot: string): SlotMetrics {
  const section = extractSection(html, slot);
  return {
    slot,
    sectionChars: section.length,
    tableRows: countTableRows(section),
    callouts: countCallouts(section),
    citeRefs: countCiteRefs(section),
    h3Count: (section.match(/<h3[\s>]/gi) ?? []).length,
    hasJourney: /journey-map|journey-lane|class=["']journey/i.test(section),
    hasScenarioCards: /scenario-cards|scenario-card/i.test(section),
    hasRiskMatrix: /risk-level|riskRows|风险矩阵/i.test(section),
    hasTimelineBlocks: /project-timeline|timeline-ongoing|tl-item/i.test(section),
    hasDecisionCallout: /callout\.(success|warning|info)/i.test(section) && slot === "decision-framework",
    hasGapCallout: /callout\.missing|资料缺口|gap/i.test(section),
  };
}

function extractMaturity(html: string): { a: string; b: string; c: string; notes: string[] } {
  const block = html.match(/stat-row[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i)?.[0] ?? "";
  const values = [...block.matchAll(/class=["']stat-value["'][^>]*>([^<]+)</gi)].map((m) =>
    m[1].trim(),
  );
  const notes = [...block.matchAll(/class=["']stat-note["'][^>]*>([^<]+)</gi)].map((m) =>
    m[1].trim(),
  );
  return { a: values[0] ?? "?", b: values[1] ?? "?", c: values[2] ?? "?", notes };
}

function countAppendixSources(html: string): number {
  const appendix = extractSection(html, "source-index");
  return (appendix.match(/id=["']source-/gi) ?? []).length;
}

function totalMetrics(html: string) {
  const slots = CANONICAL_KB_SLOTS.map((s) => analyzeSlot(html, s));
  const mat = extractMaturity(html);
  return {
    fileSize: html.length,
    slots,
    maturity: mat,
    appendixSources: countAppendixSources(html),
    totalTableRows: slots.reduce((n, s) => n + s.tableRows, 0),
    totalCallouts: slots.reduce((n, s) => n + s.callouts, 0),
    totalCiteRefs: slots.reduce((n, s) => n + s.citeRefs, 0),
    totalSectionChars: slots.reduce((n, s) => n + s.sectionChars, 0),
  };
}

const v3 = readFileSync(v3Path, "utf8");
const v4 = readFileSync(v4Path, "utf8");
const m3 = totalMetrics(v3);
const m4 = totalMetrics(v4);

console.log("=== PET v3 vs v4 质量对比 ===\n");
console.log(
  JSON.stringify(
    {
      fileSize: { v3: m3.fileSize, v4: m4.fileSize, ratio: (m4.fileSize / m3.fileSize).toFixed(2) },
      totalSectionChars: {
        v3: m3.totalSectionChars,
        v4: m4.totalSectionChars,
        ratio: (m4.totalSectionChars / m3.totalSectionChars).toFixed(2),
      },
      totalTableRows: { v3: m3.totalTableRows, v4: m4.totalTableRows },
      totalCallouts: { v3: m3.totalCallouts, v4: m4.totalCallouts },
      totalCiteRefs: { v3: m3.totalCiteRefs, v4: m4.totalCiteRefs },
      appendixSources: { v3: m3.appendixSources, v4: m4.appendixSources },
      maturity: { v3: m3.maturity, v4: m4.maturity },
    },
    null,
    2,
  ),
);

console.log("\n=== Per-slot ===");
for (const slot of CANONICAL_KB_SLOTS) {
  const s3 = m3.slots.find((s) => s.slot === slot)!;
  const s4 = m4.slots.find((s) => s.slot === slot)!;
  const charRatio = s3.sectionChars ? (s4.sectionChars / s3.sectionChars).toFixed(2) : "n/a";
  console.log(
    JSON.stringify({
      slot,
      chars: { v3: s3.sectionChars, v4: s4.sectionChars, ratio: charRatio },
      rows: { v3: s3.tableRows, v4: s4.tableRows },
      callouts: { v3: s3.callouts, v4: s4.callouts },
      cites: { v3: s3.citeRefs, v4: s4.citeRefs },
      h3: { v3: s3.h3Count, v4: s4.h3Count },
      components: {
        v3: {
          journey: s3.hasJourney,
          scenarios: s3.hasScenarioCards,
          risk: s3.hasRiskMatrix,
          timeline: s3.hasTimelineBlocks,
        },
        v4: {
          journey: s4.hasJourney,
          scenarios: s4.hasScenarioCards,
          risk: s4.hasRiskMatrix,
          timeline: s4.hasTimelineBlocks,
        },
      },
    }),
  );
}
