/**
 * Batch 2 单独 live smoke（注入 batch 1 shared context fixture，不跑 4-batch，不入库）
 * 用法：cd api-worker && npx tsx scripts/run-slot-batch-2-smoke.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.JFO_API_BASE ?? "https://jfo-api.jfo-api.workers.dev").replace(/\/$/, "");
const PROJECT_ID = process.env.JFO_PROJECT_ID ?? "proj-7c0f947a6a00";
const USER_ID = process.env.JFO_USER_ID ?? "jensen-fang";
const POLL_MS = 12_000;
const MAX_WAIT_MS = 28 * 60_000;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const t0 = Date.now();
  console.log("=== Slot-Batch Batch 2 Smoke ===");
  console.log(`API: ${BASE}`);
  console.log(`Project: ${PROJECT_ID} (非 PET)\n`);

  const startRes = await fetch(
    `${BASE}/api/projects/${encodeURIComponent(PROJECT_ID)}/knowledge-network/slot-batch-batch2-smoke?userId=${encodeURIComponent(USER_ID)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: `batch2-smoke-${Date.now()}` }),
    },
  );
  const startBody = (await startRes.json()) as Record<string, unknown>;
  if (!startRes.ok || !startBody.jobId) {
    console.error("Start failed:", startRes.status, startBody);
    process.exit(1);
  }

  const jobId = String(startBody.jobId);
  console.log("jobId:", jobId);
  console.log("mode:", startBody.knGenerationMode);

  let lastPoll: Record<string, unknown> = {};

  while (Date.now() - t0 < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    const pollRes = await fetch(
      `${BASE}/api/agent-jobs/${encodeURIComponent(jobId)}?userId=${encodeURIComponent(USER_ID)}`,
    );
    const poll = (await pollRes.json()) as Record<string, unknown>;
    const wall = Math.round((Date.now() - t0) / 1000);
    const sb = poll.slotBatchProgress as Record<string, unknown> | undefined;

    console.log(
      `[${wall}s] status=${poll.status} · batch=${sb?.currentBatchIndex}/${sb?.totalBatches} · batchStatus=${sb?.currentBatchStatus} · slots=${(sb?.completedSlots as string[])?.length ?? 0}/13 · repair=${sb?.repairAttempt}`,
    );

    lastPoll = poll;

    if (poll.status === "completed" || poll.status === "failed") {
      break;
    }
  }

  const report = {
    projectId: PROJECT_ID,
    jobId,
    status: lastPoll.status,
    wallSec: Math.round((Date.now() - t0) / 1000),
    error: lastPoll.error ?? null,
    answer: lastPoll.answer ?? null,
    slotBatchProgress: lastPoll.slotBatchProgress ?? null,
    batch2Slots: ["business-operations", "legal-ownership", "regulatory-compliance"],
    kbUnchanged: true,
  };

  const outPath = join(process.cwd(), "slot-batch-batch2-smoke-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n=== Batch 2 Smoke Report ===");
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
