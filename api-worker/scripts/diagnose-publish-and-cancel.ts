/**
 * 诊断 slot-batch publishing 并取消 running job（保留 R2 session）
 */
const BASE = (process.env.JFO_API_BASE ?? "https://jfo-api.jfo-api.workers.dev").replace(/\/$/, "");
const PROJECT_ID = process.env.JFO_PROJECT_ID ?? "proj-7c0f947a6a00";
const USER_ID = process.env.JFO_USER_ID ?? "jensen-fang";

async function fetchJson(url: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log("=== Publish Diagnostic ===\n");

  const active = await fetchJson(
    `${BASE}/api/users/${encodeURIComponent(USER_ID)}/active-agent-jobs?projectId=${encodeURIComponent(PROJECT_ID)}`,
  );
  console.log("Active jobs:", JSON.stringify(active.body, null, 2));

  const jobs =
    (active.body as { jobs?: { jobId: string; status: string }[] })?.jobs ?? [];
  const knJobs = jobs.filter((j) => j.status === "running" || j.status === "pending");

  for (const j of knJobs) {
    const jobId = j.jobId;
    const poll = await fetchJson(
      `${BASE}/api/agent-jobs/${encodeURIComponent(jobId)}?userId=${encodeURIComponent(USER_ID)}`,
    );
    const p = poll.body as Record<string, unknown>;
    const sb = p.slotBatchProgress as Record<string, unknown> | undefined;
    console.log(`\n--- Job ${jobId} ---`);
    console.log("status:", p.status);
    console.log("progressLabel:", p.progressLabel);
    console.log("elapsedSec:", p.elapsedSec);
    console.log("phase:", sb?.phase);
    console.log("currentBatchStatus:", sb?.currentBatchStatus);
    console.log("completedSlots:", sb?.completedSlots);
    console.log("currentPublishStep:", sb?.currentPublishStep);
    console.log("publishStartedAt:", sb?.publishStartedAt);
    console.log("publishError:", sb?.publishError);
    console.log("assembledHtmlBytes:", sb?.assembledHtmlBytes);
    console.log("slotQuality:", JSON.stringify(sb?.slotQuality, null, 2));

    if (j.status === "running" || j.status === "pending") {
      const cancel = await fetchJson(
        `${BASE}/api/agent-jobs/${encodeURIComponent(jobId)}/cancel?userId=${encodeURIComponent(USER_ID)}`,
        { method: "POST" },
      );
      console.log("cancel:", cancel.status, JSON.stringify(cancel.body));
    }
  }

  const meta = await fetchJson(
    `${BASE}/api/projects/${encodeURIComponent(PROJECT_ID)}/knowledge-network?userId=${encodeURIComponent(USER_ID)}`,
  );
  const m = meta.body as { meta?: { lastJobId?: string | null; version?: number } };
  console.log("\n--- D1 KB meta (summary) ---");
  console.log(
    JSON.stringify(
      {
        hasKb: (meta.body as { hasKnowledgeNetwork?: boolean }).hasKnowledgeNetwork,
        version: m.meta?.version,
        lastJobId: m.meta?.lastJobId,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
