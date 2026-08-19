import assert from "node:assert/strict";
import {
  extractSummaryField,
  looksLikeRawParseJson,
  normalizeParseSummaryText,
  shouldRefreshCachedSummary,
  truncateSummary,
} from "../src/parse-summary-text.ts";

const escaped =
  '{"summary":"清华沈阳团队2026年4月报告，研究AI小说/剧本产业现状。提出\\"前九稿红利\\"叙事操作系统\\"等概念，认为AI写作进入产业主流程，长文本一致性、版权责任是核心门槛。","do';

assert.equal(looksLikeRawParseJson(escaped), true);
assert.equal(
  extractSummaryField(escaped),
  "清华沈阳团队2026年4月报告，研究AI小说/剧本产业现状。提出\"前九稿红利\"叙事操作系统\"等概念，认为AI写作进入产业主流程，长文本一致性、版权责任是核心门槛。",
);

const unescaped =
  '{"summary":"清华沈阳团队2026年4月报告，研究AI写小说/剧本产业现状。提出"前九稿红利"叙事操作系统，并指出长文本一致性、版权责任等瓶颈。","do';

assert.equal(looksLikeRawParseJson(unescaped), true);
assert.equal(
  extractSummaryField(unescaped),
  "清华沈阳团队2026年4月报告，研究AI写小说/剧本产业现状。提出\"前九稿红利\"叙事操作系统，并指出长文本一致性、版权责任等瓶颈。",
);
assert.equal(extractSummaryField(unescaped).endsWith("提出"), false);
assert.equal(extractSummaryField(unescaped).includes("前九稿红利"), true);
assert.equal(extractSummaryField(unescaped).includes("瓶颈"), true);

const normalized = normalizeParseSummaryText(unescaped);
assert.equal(normalized.startsWith("清华沈阳团队"), true);
assert.equal(normalized.includes('{"summary"'), false);
assert.equal(normalized.includes("提出"), true);
assert.equal(normalized.includes("前九稿红利"), true);
assert.equal(normalizeParseSummaryText("正常摘要").startsWith("正常"), true);

const closed = '{"summary":"完整一句。","documentType":"研报"}';
assert.equal(extractSummaryField(closed), "完整一句。");

const chopped100 =
  "本初Narrative Forge为AI剧本连续性QA工具，Pre-product阶段，无产品/用户/收入。BP市场规模与财务预测显著脱离独立研究（TAM约1-2亿元vs BP称800亿）。已有中外竞";
assert.equal(Array.from(chopped100).length, 100);
assert.equal(shouldRefreshCachedSummary(chopped100), true);
assert.equal(shouldRefreshCachedSummary("完整一句。"), false);
assert.equal(shouldRefreshCachedSummary(escaped), true);
assert.equal(shouldRefreshCachedSummary("未能生成可用摘要，请直接预览原文。"), false);

const over =
  `${"甲。".repeat(20)}这是会被截掉的半句`;
assert.equal(truncateSummary(over, 40).endsWith("。"), true);
assert.equal(truncateSummary(over, 40).includes("半句"), false);

console.log("parse-summary-text: ok");
