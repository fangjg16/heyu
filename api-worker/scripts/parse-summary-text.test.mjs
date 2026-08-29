import assert from "node:assert/strict";
import {
  extractSummaryField,
  looksLikeRawParseJson,
  normalizeParseSummaryText,
  parseSummaryRefreshRequested,
  shouldPreferVisionForParse,
  shouldRefreshCachedSummary,
  shouldReturnCachedSummaryOnLlmError,
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

const scanSummary =
  "本文件为扫描件/图片版 PDF（大陆地块测绘图，编号 SP265790），未能提取可复制文字，无法识别测绘范围、地块面积、坐标、权属、四至等关键信息。原文未披露可供投研核验的实质数据，需另附可复制文字版 PDF 或人工 OCR 转录稿后方可用于尽调。";
assert.equal(shouldRefreshCachedSummary(scanSummary), true);
assert.equal(
  shouldRefreshCachedSummary("（扫描 PDF「a.pdf」OCR 未抽出文字。）"),
  false,
);
assert.equal(
  shouldRefreshCachedSummary(
    "未能把扫描件/图片交给视觉模型阅读。请稍后点击重新解析。",
  ),
  true,
);
assert.equal(
  parseSummaryRefreshRequested(new URLSearchParams("userId=a&refresh=1")),
  true,
);
assert.equal(
  parseSummaryRefreshRequested(new URLSearchParams("userId=a")),
  false,
);
assert.equal(
  shouldReturnCachedSummaryOnLlmError(
    "原文为扫描 PDF「a.pdf」。OCR 抽取失败未能获得任何文字内容，无法识别地块编号。建议重新进行 OCR 识别。",
    true,
  ),
  false,
);
assert.equal(
  shouldReturnCachedSummaryOnLlmError("图上北至公路，南至海岸，编号 SP265790。", true),
  true,
);
assert.equal(
  shouldPreferVisionForParse({
    cachedSummary: "可复制合同正文摘要，各方权利义务已列明。",
  }),
  false,
);
assert.equal(
  shouldPreferVisionForParse({
    cachedSummary:
      "原文为扫描 PDF「a.pdf」。OCR 抽取失败未能获得任何文字内容，无法识别地块编号。建议重新进行 OCR 识别。",
  }),
  true,
);

const over =
  `${"甲。".repeat(20)}这是会被截掉的半句`;
assert.equal(truncateSummary(over, 40).endsWith("。"), true);
assert.equal(truncateSummary(over, 40).includes("半句"), false);

console.log("parse-summary-text: ok");
