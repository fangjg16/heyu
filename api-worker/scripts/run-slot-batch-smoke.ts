/**
 * Slot-batch 最小 live smoke（默认 batch 1 完成后取消，不发布 full KB）
 * 用法：cd api-worker && npx tsx scripts/run-slot-batch-smoke.ts [--wait-full]
 */
const BASE = (process.env.JFO_API_BASE ?? "https://jfo-api.jfo-api.workers.dev").replace(/\/$/, "");
const PROJECT_ID = process.env.JFO_PROJECT_ID ?? "proj-87c4b0718f58";
const USER_ID = process.env.JFO_USER_ID ?? "jensen-fang";
const MESSAGE =
  process.env.SMOKE_MESSAGE ??
  "全量重做项目知识网络（slot-batched structured-slot-batch，勿整页 HTML）。";
const POLL_MS = 12_000;
const BATCH1_ONLY = !process.argv.includes("--wait-full");
const MAX_WAIT_MS = BATCH1_ONLY ? 18 * 60_000 : 55 * 60_000;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function countMaterialFiles(readPlan: { batchSlots?: string[] } | undefined): string {
  return readPlan ? "见 slotBatchProgress.readPlan（Worker session）" : "—";
}

async function main() {
  const t0 = Date.now();
  const conversationId = `slot-smoke-${Date.now()}`;
  console.log("=== Slot-Batch Live Smoke ===");
  console.log(`API: ${BASE}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Mode: ${BATCH1_ONLY ? "batch 1 only → cancel" : "wait full 4 batches"}\n`);

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
  console.log("knGenerationMode:", chatBody.knGenerationMode);
  console.log("currentBatchSlots:", JSON.stringify(chatBody.currentBatchSlots));
  console.log("readPlan batch0 deepRefs:", (chatBody.slotBatchProgress as { readPlan?: { deepRefs?: string[] } })?.readPlan?.deepRefs);

  let lastProgress: Record<string, unknown> | null = null;
  let batch1Done = false;

  while (Date.now() - t0 < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    const pollRes = await fetch(
      `${BASE}/api/agent-jobs/${encodeURIComponent(jobId)}?userId=${encodeURIComponent(USER_ID)}`,
    );
    const poll = (await pollRes.json()) as Record<string, unknown>;
    const wall = Math.round((Date.now() - t0) / 1000);
    const sb = poll.slotBatchProgress as Record<string, unknown> | undefined;

    console.log(
      `[${wall}s] poll ${pollRes.status}ms · status=${poll.status} · batch=${sb?.currentBatchIndex}/${sb?.totalBatches} · batchStatus=${sb?.currentBatchStatus} · slots=${(sb?.completedSlots as string[])?.length ?? 0}/13 · repair=${sb?.repairAttempt}`,
    );

    lastProgress = poll;

    if (poll.status === "completed") {
      console.log("\n=== Job completed ===");
      break;
    }
    if (poll.status === "failed") {
      console.log("\n=== Job failed ===", poll.error);
      break;
    }

    const completed = (sb?.completedSlots as string[]) ?? [];
    const timings = (sb?.batchTimings as { batchIndex: number; durationMs?: number; repairAttempted?: boolean }[]) ?? [];
    if (completed.length >= 3 && timings.some((t) => t.batchIndex === 0 && t.durationMs)) {
      batch1Done = true;
      if (BATCH1_ONLY) {
        console.log("\nBatch 1 complete — cancelling job (smoke, no full publish)...");
        const cancelRes = await fetch(
          `${BASE}/api/agent-jobs/${encodeURIComponent(jobId)}/cancel?userId=${encodeURIComponent(USER_ID)}`,
          { method: "POST" },
        );
        const cancelBody = await cancelRes.json();
        console.log("Cancel:", cancelRes.status, cancelBody);
        break;
      }
    }
  }

  const knVerRes = await fetch(
    `${BASE}/api/projects/${encodeURIComponent(PROJECT_ID)}/knowledge-network?userId=${encodeURIComponent(USER_ID)}`,
  ).catch(() => null);
  let knVersion: unknown = "?";
  if (knVerRes?.ok) {
    const kn = (await knVerRes.json()) as { version?: number };
    knVersion = kn.version ?? kn.meta?.version ?? "?";
  }

  console.log("\n=== Smoke Summary ===");
  const sb = (lastProgress?.slotBatchProgress ?? {}) as Record<string, unknown>;
  console.log("knGenerationMode:", lastProgress?.knGenerationMode);
  console.log("batchTimings:", JSON.stringify(sb.batchTimings, null, 2));
  console.log("readPlan (last batch):", JSON.stringify(sb.readPlan, null, 2));
  console.log("repairAttempt:", sb.repairAttempt);
  console.log("completedSlots:", sb.completedSlots);
  console.log("project KN version (should unchanged if batch1-only cancel):", knVersion);
  console.log("batch1Done:", batch1Done);
  console.log("total wall sec:", Math.round((Date.now() - t0) / 1000));

  if (!batch1Done && BATCH1_ONLY) {
    console.error("Smoke: batch 1 did not complete in time");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
