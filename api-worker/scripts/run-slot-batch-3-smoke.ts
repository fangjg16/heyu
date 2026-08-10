/**
 * Batch 3 单独 live smoke（注入 batch 1+2 shared context，不入库）
 * 用法：cd api-worker && npx tsx scripts/run-slot-batch-3-smoke.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.JFO_API_BASE ?? "https://jfo-api.jfo-api.workers.dev").replace(/\/$/, "");
const PROJECT_ID = process.env.JFO_PROJECT_ID ?? "proj-7c0f947a6a00";
const USER_ID = process.env.JFO_USER_ID ?? "jensen-fang";
const POLL_MS = 12_000;
const MAX_WAIT_MS = 32 * 60_000;

type SlotResult = {
  slot: string;
  score: number;
  ok: boolean;
  gapFirstMode?: boolean;
};

type BatchTiming = {
  batchIndex: number;
  durationMs?: number;
  jsonParsed?: boolean;
  repairAttempted?: boolean;
  repairJsonValid?: boolean | null;
  slotResults?: SlotResult[];
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function parseAnswerMetrics(answer: string) {
  const jsonParsed = /jsonParsed=true/.test(answer);
  const repairJsonValid =
    /repairJsonValid=true/.test(answer) ? true : /repairJsonValid=false/.test(answer) ? false : null;
  const repair = /repair=是/.test(answer);
  const durationSec = Number(answer.match(/耗时：(\d+)s/)?.[1] ?? NaN);
  const slotQuality = [...answer.matchAll(/([\w-]+):(pass|fail)\((\d+|—)\)/g)].map((m) => ({
    slot: m[1]!,
    ok: m[2] === "pass",
    score: m[3] === "—" ? 0 : Number(m[3]),
  }));
  return { jsonParsed, repairJsonValid, repair, durationSec, slotQuality };
}

async function main() {
  const t0 = Date.now();
  console.log("=== Slot-Batch Batch 3 Smoke ===");
  console.log(`API: ${BASE}`);
  console.log(`Project: ${PROJECT_ID} (非 PET)\n`);

  const startRes = await fetch(
    `${BASE}/api/projects/${encodeURIComponent(PROJECT_ID)}/knowledge-network/slot-batch-batch3-smoke?userId=${encodeURIComponent(USER_ID)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: `batch3-smoke-${Date.now()}` }),
    },
  );
  const startBody = (await startRes.json()) as Record<string, unknown>;
  if (!startRes.ok || !startBody.jobId) {
    console.error("Start failed:", startRes.status, startBody);
    process.exit(1);
  }

  const jobId = String(startBody.jobId);
  console.log("jobId:", jobId);

  let lastPoll: Record<string, unknown> = {};

  while (Date.now() - t0 < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    const pollRes = await fetch(
      `${BASE}/api/agent-jobs/${encodeURIComponent(jobId)}?userId=${encodeURIComponent(USER_ID)}`,
    );
    const poll = (await pollRes.json()) as Record<string, unknown>;
    const wall = Math.round((Date.now() - t0) / 1000);
    const sb = poll.slotBatchProgress as { batchTimings?: BatchTiming[]; repairAttempt?: number } | undefined;
    const timing = sb?.batchTimings?.find((t) => t.batchIndex === 2);

    console.log(
      `[${wall}s] status=${poll.status} · jsonParsed=${timing?.jsonParsed ?? "?"} · repair=${sb?.repairAttempt ?? 0} · repairJson=${timing?.repairJsonValid ?? "?"}`,
    );

    lastPoll = poll;

    if (poll.status === "completed" || poll.status === "failed") {
      break;
    }
  }

  const answer = String(lastPoll.answer ?? "");
  const fromAnswer = answer ? parseAnswerMetrics(answer) : null;
  const sb = lastPoll.slotBatchProgress as { batchTimings?: BatchTiming[] } | undefined;
  const batch3Timing = sb?.batchTimings?.find((t) => t.batchIndex === 2);

  const report = {
    projectId: PROJECT_ID,
    jobId,
    status: lastPoll.status,
    wallSec: Math.round((Date.now() - t0) / 1000),
    error: lastPoll.error ?? null,
    batch3Slots: ["resource-network", "comps-benchmark", "valuation-returns"],
    jsonParsed: batch3Timing?.jsonParsed ?? fromAnswer?.jsonParsed ?? null,
    repairTriggered: (batch3Timing?.repairAttempted ?? fromAnswer?.repair) || false,
    repairJsonValid: batch3Timing?.repairJsonValid ?? fromAnswer?.repairJsonValid ?? null,
    durationSec:
      batch3Timing?.durationMs != null
        ? Math.round(batch3Timing.durationMs / 1000)
        : fromAnswer?.durationSec ?? null,
    slotQuality: batch3Timing?.slotResults ?? fromAnswer?.slotQuality ?? [],
    kbUnchanged: true,
    answer,
  };

  const outPath = join(process.cwd(), "slot-batch-batch3-smoke-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n=== Batch 3 Smoke Report ===");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n报告已写入 ${outPath}`);

  if (report.status !== "completed") {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
