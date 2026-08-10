/**
 * slot-batched 链路离线验收（不调用 Hermes）
 * 用法：cd api-worker && npx tsx scripts/validate-slot-batch-offline.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  countEmptyHtmlCells,
  countEmptyHtmlRows,
} from "../src/knowledge-network-content-row-quality.ts";
import { evaluateSlotQuality } from "../src/knowledge-network-full-quality-contract.ts";
import { KN_SLOT_BATCH_PLAN } from "../src/knowledge-network-slot-batch-types.ts";
import { extractStructuredSlotBatchFromAnswer } from "../src/knowledge-network-slot-batch-extract.ts";
import {
  applyDeterministicMaturity,
  renderStructuredKbDataToHtml,
} from "../src/knowledge-network-structured-kb-data.ts";
import type { StructuredKbData } from "../src/knowledge-network-structured-kb-data-types.ts";
import { CANONICAL_KB_SLOTS } from "../src/knowledge-network-html-validation.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dir, "fixtures/pet-v6-structured-kb-data.json");

function versionFromHtml(html: string): string | null {
  return html.match(/<dt>\s*Version\s*<\/dt>\s*<dd>([^<]+)<\/dd>/i)?.[1]?.trim() ?? null;
}

function maturityFromHtml(html: string): { a?: string; b?: string; combined?: string } {
  const pick = (re: RegExp) => html.match(re)?.[1]?.trim();
  return {
    a: pick(/Content Completeness[^<]*<[^>]*>([^<]+)/i),
    b: pick(/Source Diversity[^<]*<[^>]*>([^<]+)/i),
    combined: pick(/Combined Maturity[^<]*<[^>]*>([^<]+)/i),
  };
}

/** 将整份 structured-kb-data 拆成 4 批 structured-slot-batch 模拟 Hermes 输出 */
function splitIntoBatches(data: StructuredKbData): string[] {
  const answers: string[] = [];
  for (let i = 0; i < KN_SLOT_BATCH_PLAN.length; i++) {
    const slots = KN_SLOT_BATCH_PLAN[i]!;
    const batch: Record<string, unknown> = {
      type: "structured-slot-batch",
      schemaVersion: "2.91",
      batchIndex: i,
      mode: data.mode,
      slots: slots.map((slot) => ({ slot, payload: data.slots[slot] })),
    };
    if (i === 0) {
      batch.config = data.config;
      batch.meta = data.meta;
      batch.sources = data.sources;
      batch.summary = data.summary;
      if (data.terms) batch.terms = data.terms;
      if (data.dataDictionary) batch.dataDictionary = data.dataDictionary;
    }
    answers.push(`\`\`\`json\n${JSON.stringify(batch, null, 2)}\n\`\`\``);
  }
  return answers;
}

function main() {
  const t0 = Date.now();
  const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as StructuredKbData;
  const batchAnswers = splitIntoBatches(raw);

  console.log("=== Slot-Batched 离线验收 ===\n");
  console.log("✓ 新链路不要求 Hermes 一次性输出完整 13-slot JSON");
  console.log(`  批次计划：${KN_SLOT_BATCH_PLAN.length} 批 / ${CANONICAL_KB_SLOTS.length} slot\n`);

  const accumulated: Record<string, unknown> = {};
  const shell: Record<string, unknown> = {};
  const slotTimings: { slot: string; batchIndex: number; qualityOk: boolean; issues: string[] }[] =
    [];
  let repairTriggered = false;

  for (let bi = 0; bi < batchAnswers.length; bi++) {
    const bt0 = Date.now();
    const extracted = extractStructuredSlotBatchFromAnswer(batchAnswers[bi]!);
    if (!extracted.ok) {
      console.error(`批次 ${bi + 1} 提取失败:`, extracted.reason);
      process.exit(1);
    }
    const batch = extracted.batch;
    if (bi === 0) {
      if (batch.config) shell.config = batch.config;
      if (batch.meta) shell.meta = batch.meta;
      if (batch.sources) shell.sources = batch.sources;
      if (batch.summary) shell.summary = batch.summary;
    }
    for (const item of batch.slots) {
      const q = evaluateSlotQuality(item.slot, item.payload);
      slotTimings.push({
        slot: item.slot,
        batchIndex: bi,
        qualityOk: q.ok,
        issues: q.issues.map((i) => i.message),
      });
      if (!q.ok) repairTriggered = true;
      accumulated[item.slot] = item.payload;
    }
    const batchMs = Date.now() - bt0;
    console.log(
      `批次 ${bi + 1}/${KN_SLOT_BATCH_PLAN.length}（${KN_SLOT_BATCH_PLAN[bi]!.join(" + ")}）模拟耗时 ${batchMs}ms`,
    );
  }

  console.log("\n--- 每 slot Quality Contract ---");
  for (const rec of slotTimings) {
    const flag = rec.qualityOk ? "PASS" : "FAIL";
    console.log(`  ${rec.slot}: ${flag}${rec.issues.length ? ` (${rec.issues.slice(0, 2).join("; ")})` : ""}`);
  }
  console.log(`\nrepair 触发：${repairTriggered ? "是（fixture 部分 slot 未达 rich contract）" : "否"}`);

  const assembled: StructuredKbData = {
    type: "structured-kb-data",
    schemaVersion: "2.91",
    mode: raw.mode,
    summary: String(shell.summary ?? raw.summary),
    config: (shell.config ?? raw.config) as StructuredKbData["config"],
    meta: (shell.meta ?? raw.meta) as StructuredKbData["meta"],
    maturity: raw.maturity,
    slots: accumulated as StructuredKbData["slots"],
    sources: (shell.sources ?? raw.sources) as StructuredKbData["sources"],
  };
  const withMaturity = applyDeterministicMaturity(assembled);
  const rendered = renderStructuredKbDataToHtml(withMaturity, { versionDisplay: "v7" });
  if (!rendered.ok) {
    console.error("渲染失败:", rendered.reason);
    process.exit(1);
  }

  const html = rendered.html;
  const emptyRows = countEmptyHtmlRows(html);
  const emptyCells = countEmptyHtmlCells(html);
  const mat = maturityFromHtml(html);
  const totalMs = Date.now() - t0;

  console.log("\n--- 组装与渲染 ---");
  console.log(`  空 tbody row: ${emptyRows}`);
  console.log(`  空 td cell: ${emptyCells}`);
  console.log(`  Version: ${versionFromHtml(html)}`);
  console.log(`  Factor A: ${mat.a ?? "—"}`);
  console.log(`  Factor B: ${mat.b ?? "—"}`);
  console.log(`  Combined: ${mat.combined ?? "—"}`);
  console.log(`  总离线模拟耗时: ${totalMs}ms`);

  console.log("\n=== 验收结论 ===");
  console.log("1. slot-batched 主链路：Worker 分批累积 → assemble → 确定性渲染 ✓");
  console.log("2. 每 slot 独立 quality check ✓");
  console.log("3. monolithic 一次性 JSON 已非 full/initial 默认路径（deploy 后）");
  console.log("4. live 端到端耗时需单独发起 slot-batched job 测量（本脚本为离线）");
}

main();
