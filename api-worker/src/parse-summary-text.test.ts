import { describe, expect, it } from "vitest";
import { shouldRefreshCachedSummary, looksLikeOcrEmptyLlmSummary } from "./parse-summary-text";

describe("shouldRefreshCachedSummary", () => {
  it("keeps a normal complete sentence", () => {
    expect(shouldRefreshCachedSummary("完整一句。")).toBe(false);
  });

  it("refetches pre-OCR scan summaries that admit no extractable text", () => {
    const scanSummary =
      "本文件为扫描件/图片版 PDF（大陆地块测绘图，编号 SP265790），未能提取可复制文字，无法识别测绘范围、地块面积、坐标、权属、四至等关键信息。原文未披露可供投研核验的实质数据，需另附可复制文字版 PDF 或人工 OCR 转录稿后方可用于尽调。";
    expect(shouldRefreshCachedSummary(scanSummary)).toBe(true);
  });

  it("does not loop after OCR already failed", () => {
    expect(
      shouldRefreshCachedSummary("（扫描 PDF「a.pdf」OCR 未抽出文字。）"),
    ).toBe(false);
  });

  it("refetches summaries that only failed because pdf.js detached the buffer", () => {
    expect(
      shouldRefreshCachedSummary(
        "Cannot perform Construct on a detached ArrayBuffer",
      ),
    ).toBe(true);
    expect(
      shouldRefreshCachedSummary(
        "（扫描 PDF「02.pdf」OCR 未抽出文字。Cannot perform Construct on a detached ArrayBuffer）",
      ),
    ).toBe(true);
  });

  it("refetches LLM paraphrases of empty OCR, but not the short terminal give-up", () => {
    const llm =
      "原文为扫描 PDF「02.pdf」，OCR 抽取失败未能获得任何文字内容，无法识别地块编号。建议重新进行 OCR 识别。";
    expect(looksLikeOcrEmptyLlmSummary(llm)).toBe(true);
    expect(shouldRefreshCachedSummary(llm)).toBe(true);
    expect(
      shouldRefreshCachedSummary("（扫描 PDF「a.pdf」OCR 未抽出文字。）"),
    ).toBe(false);
  });
});
