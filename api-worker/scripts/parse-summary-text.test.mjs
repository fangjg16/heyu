import assert from "node:assert/strict";
import {
  extractSummaryField,
  looksLikeRawParseJson,
  normalizeParseSummaryText,
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

console.log("parse-summary-text: ok");
