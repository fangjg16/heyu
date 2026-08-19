import assert from "node:assert/strict";
import {
  extractSummaryField,
  looksLikeRawParseJson,
  normalizeParseSummaryText,
} from "../src/parse-summary-text.ts";

const blob =
  '{"summary":"清华沈阳团队2026年4月报告，研究AI小说/剧本产业现状。提出\\"前九稿红利\\"叙事操作系统\\"等概念，认为AI写作进入产业主流程，长文本一致性、版权责任是核心门槛。","do';

assert.equal(looksLikeRawParseJson(blob), true);
assert.equal(
  extractSummaryField(blob),
  "清华沈阳团队2026年4月报告，研究AI小说/剧本产业现状。提出\"前九稿红利\"叙事操作系统\"等概念，认为AI写作进入产业主流程，长文本一致性、版权责任是核心门槛。",
);
assert.equal(
  normalizeParseSummaryText(blob).startsWith("清华沈阳团队"),
  true,
);
assert.equal(normalizeParseSummaryText(blob).includes('{"summary"'), false);
assert.equal(normalizeParseSummaryText("正常摘要").startsWith("正常"), true);

console.log("parse-summary-text: ok");
