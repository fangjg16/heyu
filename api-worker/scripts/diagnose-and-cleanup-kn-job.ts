/**
 * 诊断 Hermes KN job 并清理僵尸 pending 状态
 * 用法：cd api-worker && npx tsx scripts/diagnose-and-cleanup-kn-job.ts [jobId]
 */
const args = process.argv.slice(2);
const DO_FAIL = args.includes("--fail");
const DO_CLEAR_PENDING = args.includes("--clear-pending") || DO_FAIL;
const JOB_ID =
  args.find((a) => !a.startsWith("--"))?.trim() ||
  "d9267186-4b0b-4950-a2f4-f4e9f27e3208";
const RUN_ID = process.env.HERMES_RUN_ID ?? "run_7200c996ddbd42ca8bcb713776d226fc";
const BASE = (process.env.JFO_API_BASE ?? "https://jfo-api.jfo-api.workers.dev").replace(/\/$/, "");
const USER_ID = process.env.JFO_USER_ID ?? "jensen-fang";
const HERMES_BASE = (process.env.HERMES_BASE_URL ?? "").replace(/\/$/, "");
const HERMES_KEY = process.env.HERMES_API_KEY ?? "";

async function timedFetch(url: string, init?: RequestInit, timeoutMs = 12_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 800) };
    }
    return { ok: res.ok, status: res.status, json, elapsedMs: timeoutMs };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      json: { error: e instanceof Error ? e.message : String(e), aborted: true },
      elapsedMs: timeoutMs,
    };
  } finally {
    clearTimeout(t);
  }
}

async function pollHermesRun(runId: string) {
  if (!HERMES_BASE) {
    return { skipped: true, reason: "HERMES_BASE_URL 未设置" };
  }
  const urls = [
    `${HERMES_BASE}/v1/runs/${encodeURIComponent(runId)}`,
    `${HERMES_BASE}/runs/${encodeURIComponent(runId)}`,
  ];
  for (const url of urls) {
    const r = await timedFetch(
      url,
      { headers: HERMES_KEY ? { Authorization: `Bearer ${HERMES_KEY}` } : {} },
      10_000,
    );
    if (r.status === 404) continue;
    return { url, ...r };
  }
  return { skipped: true, reason: "Hermes run 404 或未配置" };
}

async function pollWorkerJob(jobId: string) {
  const url = `${BASE}/api/agent-jobs/${encodeURIComponent(jobId)}?userId=${encodeURIComponent(USER_ID)}`;
  const t0 = Date.now();
  const r = await timedFetch(url, undefined, 15_000);
  return { url, ...r, wallMs: Date.now() - t0 };
}

function summarizeHermesRun(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== "object") return {};
  const status = String(raw.status ?? "unknown");
  const output = String(raw.output ?? raw.result ?? "");
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  const toolCalls = steps.filter(
    (s: unknown) =>
      typeof s === "object" &&
      s &&
      (String((s as { type?: string }).type).includes("tool") ||
        (s as { tool?: string }).tool),
  );
  return {
    status,
    outputLen: output.length,
    outputPreview: output.slice(0, 200),
    hasStructuredKb: output.includes("structured-kb-data"),
    hasSlotBatch: output.includes("structured-slot-batch"),
    stepCount: steps.length,
    toolCallCount: toolCalls.length,
    error: raw.error,
  };
}

async function main() {
  console.log("=== KN Job 诊断 ===");
  console.log(`Job: ${JOB_ID}`);
  console.log(`Hermes Run: ${RUN_ID}`);
  console.log(`Worker API: ${BASE}\n`);

  console.log("--- Worker Poll API（15s 超时）---");
  const poll = await pollWorkerJob(JOB_ID);
  console.log(`HTTP ${poll.status} · wall ${poll.wallMs}ms`);
  if (poll.json && typeof poll.json === "object") {
    const b = poll.json as Record<string, unknown>;
    console.log("  status:", b.status);
    console.log("  hermesStatus:", b.hermesStatus);
    console.log("  elapsedSec:", b.elapsedSec);
    console.log("  progressLabel:", b.progressLabel);
    console.log("  answerLen:", String(b.answer ?? "").length);
    console.log("  knHtmlLen:", String(b.knowledgeNetworkHtml ?? "").length);
    if (poll.wallMs >= 14_000) console.log("  ⚠ Poll API 接近/达到超时 — reconcile 可能仍阻塞");
    else console.log("  ✓ Poll API 快速返回");
  } else {
    console.log(poll.json);
  }

  console.log("\n--- Hermes Run 快照（10s 超时）---");
  const hermes = await pollHermesRun(RUN_ID);
  if ("skipped" in hermes) {
    console.log("  跳过:", hermes.reason);
  } else {
    console.log(`  URL: ${hermes.url}`);
    console.log(`  HTTP ${hermes.status}`);
    const body = hermes.json as Record<string, unknown> | null;
    const summary = summarizeHermesRun(body);
    console.log("  摘要:", JSON.stringify(summary, null, 2));
    if (summary.status === "running" && summary.toolCallCount > 20) {
      console.log("  ⚠ 疑似工具调用循环（steps 较多）");
    }
    if (summary.status === "running" && summary.outputLen === 0) {
      console.log("  → 仍在 running，尚无 output（可能在读资料或生成中）");
    }
    if (summary.hasStructuredKb && summary.outputLen > 0) {
      console.log("  → 已输出 monolithic structured-kb-data，Worker 可能未收尾");
    }
  }

  if (DO_FAIL) {
    console.log("\n--- 标记 failed（MySQL）---");
    const err =
      "用户取消：monolithic 全量任务已废弃，请使用 slot-batched 重新发起全量重做";
    const answer = `深度分析失败：${err}`;
    const now = new Date().toISOString();
    const sql = `
UPDATE agent_jobs
SET status = 'failed', error = '${err.replace(/'/g, "''")}', answer = '${answer.replace(/'/g, "''")}',
    knowledge_network_html = NULL, updated_at = '${now}'
WHERE id = '${JOB_ID}';
`;
    console.log("请在 MySQL 客户端执行：");
    console.log(sql.trim());
  }

  if (DO_CLEAR_PENDING) {
    console.log("\n--- 清理 pending_job_id ---");
    const sql = `
UPDATE user_chat_messages
SET pending_job_id = NULL, updated_at = NOW()
WHERE pending_job_id = '${JOB_ID}';
`;
    console.log("请在 MySQL 客户端执行：");
    console.log(sql.trim());
  }

  console.log("\n完成。重新发起全量请使用 slot-batched 路径。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
