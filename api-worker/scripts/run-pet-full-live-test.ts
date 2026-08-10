/**
 * PET 全量知识网络 live 测试（structured-kb-data 路径）
 * 用法：cd api-worker && npx tsx scripts/run-pet-full-live-test.ts
 */
import {
  countEmptyHtmlCells,
  countEmptyHtmlRows,
} from "../src/knowledge-network-content-row-quality.ts";
import { validateFullStructuredKbQuality } from "../src/knowledge-network-full-quality-contract.ts";
import { extractStructuredKbDataFromAnswer } from "../src/knowledge-network-structured-kb-data.ts";

const BASE = (process.env.JFO_API_BASE ?? "https://jfo-api.jfo-api.workers.dev").replace(/\/$/, "");
const PROJECT_ID = "proj-87c4b0718f58";
const USER_ID = process.env.JFO_USER_ID ?? "jensen-fang";
const MESSAGE =
  "全量重做项目知识网络：交付 structured-kb-data JSON（v2.91 full，13 slot），勿写整页 HTML。";
const POLL_MS = 15_000;
const MAX_WAIT_MS = 26 * 60_000;

function versionFromHtml(html: string): string | null {
  return html.match(/<dt>\s*Version\s*<\/dt>\s*<dd>([^<]+)<\/dd>/i)?.[1]?.trim() ?? null;
}

function maturityFromHtml(html: string): { a?: string; b?: string; combined?: string } {
  const pick = (re: RegExp) => html.match(re)?.[1]?.trim();
  return {
    a: pick(/Content Completeness[^<]*<[^>]*>([^<]+)/i) ?? pick(/FACTOR_A[^>]*>([^<]+)/i),
    b: pick(/Source Diversity[^<]*<[^>]*>([^<]+)/i),
    combined: pick(/Combined Maturity[^<]*<[^>]*>([^<]+)/i),
  };
}

function countFullyEmptyTbodyRows(html: string): number {
  let count = 0;
  for (const tbody of html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/gi)) {
    for (const tr of (tbody[1] ?? "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
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

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const t0 = Date.now();
  const conversationId = `pet-live-${Date.now()}`;

  console.log("=== PET Full Live Test ===");
  console.log(`API: ${BASE}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`User: ${USER_ID}`);
  console.log(`Message: ${MESSAGE}\n`);

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
  if (!chatRes.ok) {
    console.error("Chat start failed:", chatRes.status, chatBody);
    process.exit(1);
  }

  const jobId = String(chatBody.jobId ?? "");
  const asyncFlag = chatBody.async;
  if (!jobId || !asyncFlag) {
    console.error("Expected async job; got:", chatBody);
    process.exit(1);
  }
  console.log(`Job started: ${jobId}`);

  let final: Record<string, unknown> | null = null;
  while (Date.now() - t0 < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    const pollRes = await fetch(
      `${BASE}/api/agent-jobs/${encodeURIComponent(jobId)}?userId=${encodeURIComponent(USER_ID)}`,
    );
    const poll = (await pollRes.json()) as Record<string, unknown>;
    const status = String(poll.status ?? "");
    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(
      `[${elapsed}s] status=${status} stage=${poll.jobStage ?? "-"} progress=${poll.progressLabel ?? "-"}`,
    );
    if (status === "completed" || status === "failed" || status === "cancelled") {
      final = poll;
      break;
    }
  }

  const totalSec = Math.round((Date.now() - t0) / 1000);
  if (!final) {
    console.error(`Timeout after ${totalSec}s`);
    process.exit(2);
  }

  const answer = String(final.answer ?? "");
  const error = String(final.error ?? "");
  const status = String(final.status ?? "");

  const extracted = extractStructuredKbDataFromAnswer(answer);
  const usedStructured = extracted.ok;
  const repairTriggered =
    /repair pass|repair_needed|repair pass|structured-kb-data repair|经一次 structured/i.test(answer);
  const repairFailed = status === "failed" && /repair_needed|未达发布门槛|Quality Contract/i.test(answer + error);

  let richContractMet: boolean | null = null;
  let qualityOk: boolean | null = null;
  if (extracted.ok) {
    const q = validateFullStructuredKbQuality(extracted.data);
    richContractMet = q.richContractMet;
    qualityOk = q.ok;
  }

  let knHtml = String(final.knowledgeNetworkHtml ?? "");
  if (!knHtml.trim()) {
    const knRes = await fetch(
      `${BASE}/api/projects/${encodeURIComponent(PROJECT_ID)}/knowledge-network?userId=${encodeURIComponent(USER_ID)}&html=1`,
    );
    if (knRes.ok) {
      const knBody = (await knRes.json()) as { html?: string; version?: number; versionLabel?: string | null };
      knHtml = knBody.html ?? "";
    }
  }

  const versionDisplay = knHtml ? versionFromHtml(knHtml) : null;
  const mat = knHtml ? maturityFromHtml(knHtml) : {};
  const emptyRows = knHtml ? countFullyEmptyTbodyRows(knHtml) : -1;
  const emptyCells = knHtml ? countEmptyHtmlCells(knHtml) : -1;
  const emptySectionRows = knHtml ? countEmptyHtmlRows(knHtml) : -1;

  const prevVersion = final.projectKnowledgeNetworkVersion;

  console.log("\n=== Results ===");
  console.log(`总耗时: ${totalSec}s`);
  console.log(`Job status: ${status}`);
  console.log(`走 structured-kb-data: ${usedStructured ? "是" : "否"}`);
  console.log(`触发 repair pass: ${repairTriggered ? "是（见 answer 文案）" : repairFailed ? "尝试过但未入库" : "否/未明确"}`);
  if (richContractMet !== null) {
    console.log(`richContractMet: ${richContractMet}`);
    console.log(`quality contract ok: ${qualityOk}`);
  }
  console.log(`Factor A: ${mat.a ?? "(n/a)"}`);
  console.log(`Factor B: ${mat.b ?? "(n/a)"}`);
  console.log(`Combined: ${mat.combined ?? "(n/a)"}`);
  console.log(`Version (HTML masthead): ${versionDisplay ?? "(n/a)"}`);
  console.log(`D1 version seq: ${prevVersion ?? "(unchanged if failed)"}`);
  console.log(`empty tbody rows: ${emptyRows}`);
  console.log(`empty section rows: ${emptySectionRows}`);
  console.log(`empty/placeholder cells: ${emptyCells}`);

  if (error) console.log(`\nError: ${error.slice(0, 500)}`);
  if (!usedStructured) {
    console.log("\nAnswer snippet:", answer.slice(0, 400));
  }

  process.exit(status === "completed" ? 0 : 1);
}

void main();
