/**
 * 完整 4-batch slot-batched live 验收
 * 默认测试项目 proj-7c0f947a6a00（11 份资料，非 PET）
 * 用法：cd api-worker && npx tsx scripts/run-slot-batch-full-acceptance.ts
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
import { KN_SLOT_BATCH_PLAN } from "../src/knowledge-network-slot-batch-types.ts";

const BASE = (process.env.JFO_API_BASE ?? "https://jfo-api.jfo-api.workers.dev").replace(/\/$/, "");
const PROJECT_ID = process.env.JFO_PROJECT_ID ?? "proj-7c0f947a6a00";
const USER_ID = process.env.JFO_USER_ID ?? "jensen-fang";
const MESSAGE =
  process.env.ACCEPTANCE_MESSAGE ??
  "全量重做项目知识网络：使用 slot-batched structured-slot-batch（4 批次 13 slot），勿输出整页 HTML。";
const POLL_MS = 12_000;
const MAX_WAIT_MS = 58 * 60_000;

type SlotResult = {
  slot: string;
  score: number;
  ok: boolean;
  gapFirstMode?: boolean;
  factCoverage?: number;
  gapCoverage?: number;
  issues?: string[];
};

type BatchTiming = {
  batchIndex: number;
  slots: string[];
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  repairAttempted?: boolean;
  repairStartedAt?: string;
  repairDurationMs?: number;
  jsonParsed?: boolean;
  repairJsonValid?: boolean | null;
  slotResults?: SlotResult[];
  injectionMeta?: {
    deepRefCount: number;
    materialHintsFileCount: number;
    readingPlanMustRead: number;
    readingPlanShouldRead: number;
    digestIncluded: boolean;
  };
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function versionFromHtml(html: string): string | null {
  return html.match(/<dt>\s*Version\s*<\/dt>\s*<dd>([^<]+)<\/dd>/i)?.[1]?.trim() ?? null;
}

function maturityFromHtml(html: string): { a: string; b: string; combined: string } {
  const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? "—";
  return {
    a: pick(/Content Completeness[\s\S]*?<(?:dd|span)[^>]*>([^<]+)/i),
    b: pick(/Source Diversity[\s\S]*?<(?:dd|span)[^>]*>([^<]+)/i),
    combined: pick(/Combined Maturity[\s\S]*?<(?:dd|span)[^>]*>([^<]+)/i),
  };
}

function qualityCoverageFromHtml(html: string): string | null {
  return html.match(/quality-coverage:\s*([^\s"'>]+)/i)?.[1] ?? null;
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

  const diligence = sectionHtml(html, "diligence-gaps");
  const risks = sectionHtml(html, "risks-mitigation");
  const timeline = sectionHtml(html, "timeline-milestones");

  return {
    strictPass: strict.ok,
    strictReason: strict.ok ? null : strict.reason,
    emptyTbodyRows: countEmptyHtmlRows(html),
    emptyTdCells: countEmptyHtmlCells(html),
    slotsPresent: slotsPresent.length,
    slotsMissing: CANONICAL_KB_SLOTS.filter((s) => !slotsPresent.includes(s)),
    appendices,
    appendicesAllPresent: appendices.every((a) => a.ok),
    citationRefs: citeRefs.length,
    brokenCitationTargets: brokenCites,
    citationsOk: brokenCites.length === 0 && citeRefs.length > 0,
    diligenceHasDetailsTopic: /<details[\s\S]*?<summary[\s\S]*?topic/i.test(diligence),
    risksHasLevelBadge: /risk-level|badge.*risk|class=["'][^"']*risk-/i.test(risks),
    timelineIndustryLeak: /行业(动态|趋势|新闻)|market trend|sector news/i.test(timeline),
    timelineProjectOnly: !/行业(动态|趋势|新闻)|market trend|sector news/i.test(timeline),
    versionDisplay: versionFromHtml(html),
    qualityCoverage: qualityCoverageFromHtml(html),
    maturity: maturityFromHtml(html),
  };
}

function formatBatchReport(timings: BatchTiming[], failedBatchIndex: number | null) {
  const byIndex = new Map(timings.map((t) => [t.batchIndex, t]));
  return KN_SLOT_BATCH_PLAN.map((planSlots, i) => {
    const t = byIndex.get(i);
    const success = t?.slotResults?.every((s) => s.ok) ?? false;
    return {
      batch: i + 1,
      batchIndex: i,
      slots: [...planSlots],
      durationSec: t?.durationMs ? Math.round(t.durationMs / 1000) : null,
      repairDurationSec: t?.repairDurationMs ? Math.round(t.repairDurationMs / 1000) : null,
      jsonParsed: t?.jsonParsed ?? (t ? false : null),
      repairTriggered: t?.repairAttempted ?? false,
      repairJsonValid: t?.repairJsonValid ?? null,
      batchSucceeded: failedBatchIndex === null ? success || Boolean(t?.completedAt) : i < failedBatchIndex,
      failed: failedBatchIndex === i,
      slotQuality: (t?.slotResults ?? []).map((s) => ({
        slot: s.slot,
        score: s.score,
        ok: s.ok,
        gapFirstMode: s.gapFirstMode ?? false,
        factCoverage: s.factCoverage ?? null,
        gapCoverage: s.gapCoverage ?? null,
        issues: s.issues?.slice(0, 3) ?? [],
      })),
      injection: t?.injectionMeta
        ? {
            deepRefs: t.injectionMeta.deepRefCount,
            hintFiles: t.injectionMeta.materialHintsFileCount,
            planMust: t.injectionMeta.readingPlanMustRead,
            planShould: t.injectionMeta.readingPlanShouldRead,
            digest: t.injectionMeta.digestIncluded,
          }
        : null,
    };
  });
}

async function main() {
  const t0 = Date.now();
  const conversationId = `slot-full-accept-${Date.now()}`;

  const knBeforeRes = await fetch(
    `${BASE}/api/projects/${encodeURIComponent(PROJECT_ID)}/knowledge-network?userId=${encodeURIComponent(USER_ID)}`,
  );
  const knBefore = knBeforeRes.ok ? ((await knBeforeRes.json()) as { version?: number; versionLabel?: string }) : {};
  const versionBefore = knBefore.version ?? null;
  const versionLabelBefore = knBefore.versionLabel ?? null;

  console.log("=== Slot-Batch Full Acceptance ===");
  console.log(`Project: ${PROJECT_ID} (非 PET)`);
  console.log(`KB version before: v${versionBefore ?? "—"}${versionLabelBefore ? ` (${versionLabelBefore})` : ""}`);
  console.log(`Expected on success: v${(versionBefore ?? 0) + 1}\n`);

  const chatRes = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: PROJECT_ID,
      userId: USER_ID,
      conversationId,
      message: MESSAGE,
      history: [],
    }),
  });
  const chatBody = (await chatRes.json()) as Record<string, unknown>;
  if (!chatRes.ok || !chatBody.jobId) {
    console.error("Start failed:", chatRes.status, chatBody);
    process.exit(1);
  }

  const jobId = String(chatBody.jobId);
  console.log("jobId:", jobId);

  let lastPoll: Record<string, unknown> = {};
  let lastTimings: BatchTiming[] = [];

  while (Date.now() - t0 < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    const pollRes = await fetch(
      `${BASE}/api/agent-jobs/${encodeURIComponent(jobId)}?userId=${encodeURIComponent(USER_ID)}`,
    );
    const poll = (await pollRes.json()) as Record<string, unknown>;
    lastPoll = poll;
    const sb = poll.slotBatchProgress as { batchTimings?: BatchTiming[] } | undefined;
    if (sb?.batchTimings?.length) lastTimings = sb.batchTimings;

    const wall = Math.round((Date.now() - t0) / 1000);
    const completed = (sb as { completedSlots?: string[] })?.completedSlots?.length ?? 0;
    console.log(
      `[${wall}s] ${poll.status} · batch ${(poll.currentBatchIndex as number) ?? "?"}/4 · ${poll.currentBatchStatus} · slots ${completed}/13 · repair=${(sb as { repairAttempt?: number })?.repairAttempt ?? 0}`,
    );

    if (poll.status === "completed" || poll.status === "failed" || poll.status === "cancelled") {
      break;
    }
  }

  const status = String(lastPoll.status ?? "timeout");
  const html = String(lastPoll.knowledgeNetworkHtml ?? "");
  const answer = String(lastPoll.answer ?? "");
  const error = String(lastPoll.error ?? "");

  const knAfterRes = await fetch(
    `${BASE}/api/projects/${encodeURIComponent(PROJECT_ID)}/knowledge-network?userId=${encodeURIComponent(USER_ID)}`,
  );
  const knAfter = knAfterRes.ok ? ((await knAfterRes.json()) as { version?: number; versionLabel?: string }) : {};
  const versionAfter = knAfter.version ?? null;
  const versionLabelAfter = knAfter.versionLabel ?? null;

  const sb = lastPoll.slotBatchProgress as {
    currentBatchIndex?: number;
    repairAttempt?: number;
    unresolvedGaps?: string[];
    slotQuality?: Record<string, SlotResult & { issues: string[] }>;
  };

  const failedBatchIndex =
    status === "failed" ? (sb?.currentBatchIndex ?? lastTimings.length) : null;
  const batchReports = formatBatchReport(lastTimings, failedBatchIndex);
  const batchDurationSumSec = batchReports.reduce((sum, b) => sum + (b.durationSec ?? 0), 0);

  const report: Record<string, unknown> = {
    projectId: PROJECT_ID,
    jobId,
    status,
    versionBefore,
    versionLabelBefore,
    versionAfter,
    versionLabelAfter,
    d1VersionIncremented: versionAfter !== null && versionBefore !== null && versionAfter === versionBefore + 1,
    publishSucceeded: status === "completed" && versionAfter !== versionBefore,
    kbPreserved: status !== "completed" || versionAfter === versionBefore,
    wallSec: Math.round((Date.now() - t0) / 1000),
    batchDurationSumSec,
    orchestration: "slot-batched-4-batch",
    comparisonNote:
      "Monolithic 全量 JSON 曾出现超时/僵尸 job；slot-batched 按批校验，失败 batch 不污染已接受 slot。",
    batches: batchReports,
    error: status !== "completed" ? error || lastPoll.progressLabel : null,
  };

  if (status === "failed") {
    const failBatch = batchReports.find((b) => b.failed) ?? batchReports[batchReports.length - 1];
    report.failure = {
      batch: failBatch?.batch ?? (sb?.currentBatchIndex ?? 0) + 1,
      slots: failBatch?.slots ?? sb?.currentBatchIndex,
      repairAttempt: sb?.repairAttempt ?? 0,
      message: error,
      jsonParsed: failBatch?.jsonParsed,
      repairJsonValid: failBatch?.repairJsonValid,
      gaps: sb?.unresolvedGaps?.slice(-12),
      recommendation: `先做 batch ${failBatch?.batch ?? "?"} 专用 smoke，勿改全局 contract`,
    };
  }

  if (html) {
    const htmlAnalysis = analyzeHtml(html);
    report.publishValidation = htmlAnalysis;

    const extracted = extractStructuredKbDataFromAnswer(answer);
    if (extracted.ok) {
      const q = validateFullStructuredKbQuality(extracted.data);
      report.structuredQuality = {
        richContractMet: q.richContractMet,
        gapFirstPublishOk: q.gapFirstPublishOk,
        gapFirstSlots: q.gapFirstSlots,
        coverageScore: q.coverageScore,
        publishCoverage: q.publishCoverage,
        ok: q.ok,
        slotScores: q.slotScores,
        issueCount: q.issues.length,
        topIssues: q.issues.slice(0, 8).map((i) => `${i.slot}: ${i.message}`),
      };
    }

    report.publishSummary = {
      factorA: htmlAnalysis.maturity.a,
      factorB: htmlAnalysis.maturity.b,
      combined: htmlAnalysis.maturity.combined,
      richContractMet: (report.structuredQuality as { richContractMet?: boolean })?.richContractMet ?? null,
      qualityCoverage: htmlAnalysis.qualityCoverage,
      versionDisplay: htmlAnalysis.versionDisplay,
      emptyTbodyRows: htmlAnalysis.emptyTbodyRows,
      emptyTdCells: htmlAnalysis.emptyTdCells,
      citationsOk: htmlAnalysis.citationsOk,
      appendicesAD: htmlAnalysis.appendicesAllPresent,
      diligenceDetailsTopic: htmlAnalysis.diligenceHasDetailsTopic,
      risksLevelBadge: htmlAnalysis.risksHasLevelBadge,
      timelineProjectOnly: htmlAnalysis.timelineProjectOnly,
    };
  }

  const outPath = join(process.cwd(), "slot-batch-full-acceptance-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n=== 验收报告 ===");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n报告已写入 ${outPath}`);

  if (status !== "completed") process.exit(status === "timeout" ? 2 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
