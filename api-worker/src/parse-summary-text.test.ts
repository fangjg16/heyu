import { describe, expect, it } from "vitest";
import { shouldRefreshCachedSummary, looksLikeOcrEmptyLlmSummary, parseSummaryRefreshRequested, shouldPreferVisionForParse, shouldReturnCachedSummaryOnLlmError } from "./parse-summary-text";

describe("shouldRefreshCachedSummary", () => {
  it("keeps a normal complete sentence", () => {
    expect(shouldRefreshCachedSummary("完整一句。")).toBe(false);
  });

  it("refetches pre-OCR scan summaries that admit no extractable text", () => {
    const scanSummary =
      "本文件为扫描件/图片版 PDF（大陆地块测绘图，编号 SP265790），未能提取可复制文字，无法识别测绘范围、地块面积、坐标、权属、四至等关键信息。原文未披露可供投研核验的实质数据，需另附可复制文字版 PDF 或人工 OCR 转录稿后方可用于尽调。";
    expect(shouldRefreshCachedSummary(scanSummary)).toBe(true);
  });

  it("refetches OCR-empty scan summaries so vision can read the figure", () => {
    expect(
      shouldRefreshCachedSummary("（扫描 PDF「a.pdf」OCR 未抽出文字。）"),
    ).toBe(true);
  });

  it("does not loop after vision already failed to read the figure", () => {
    expect(
      shouldRefreshCachedSummary("视觉理解未能读出图面：模型超时"),
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
      shouldRefreshCachedSummary("视觉理解未能读出图面：HTTP 400"),
    ).toBe(false);
  });

  it("refetches the survey-map OCR paraphrase so vision can replace it", () => {
    const survey =
      "原文为扫描 PDF「02_大陆地块测绘图_SP265790.pdf」。OCR 抽取失败未能获得任何文字内容，无法识别地块编号、位置、面积、四至、权属人、测绘单位、比例尺、坐标系、测绘日期等关键信息。仅能确认文件名指向一份编号为 SP265790 的大陆地块测绘图，疑为土地资产尽调中的权属/边界类附件。建议重新进行 OCR 识别或人工核验扫描件后再解析。";
    expect(looksLikeOcrEmptyLlmSummary(survey)).toBe(true);
    expect(shouldRefreshCachedSummary(survey)).toBe(true);
  });
});

describe("parseSummaryRefreshRequested", () => {
  it("reads refresh=1 / true / yes", () => {
    expect(
      parseSummaryRefreshRequested(new URLSearchParams("refresh=1")),
    ).toBe(true);
    expect(
      parseSummaryRefreshRequested(new URLSearchParams("refresh=true")),
    ).toBe(true);
    expect(
      parseSummaryRefreshRequested(new URLSearchParams("force=yes")),
    ).toBe(true);
  });

  it("ignores missing or other values", () => {
    expect(parseSummaryRefreshRequested(new URLSearchParams("userId=a"))).toBe(
      false,
    );
    expect(
      parseSummaryRefreshRequested(new URLSearchParams("refresh=0")),
    ).toBe(false);
  });
});

describe("shouldReturnCachedSummaryOnLlmError", () => {
  const survey =
    "原文为扫描 PDF「02_大陆地块测绘图_SP265790.pdf」。OCR 抽取失败未能获得任何文字内容，无法识别地块编号。建议重新进行 OCR 识别。";

  it("does not replay OCR-failure paraphrases after a vision error", () => {
    expect(shouldReturnCachedSummaryOnLlmError(survey, false)).toBe(false);
    expect(shouldReturnCachedSummaryOnLlmError(survey, true)).toBe(false);
  });

  it("still returns a normal cached summary when a later LLM call fails", () => {
    expect(
      shouldReturnCachedSummaryOnLlmError("图上北至公路，南至海岸，编号 SP265790。", false),
    ).toBe(true);
    expect(
      shouldReturnCachedSummaryOnLlmError("图上北至公路，南至海岸，编号 SP265790。", true),
    ).toBe(false);
  });
});

describe("shouldPreferVisionForParse", () => {
  const survey =
    "原文为扫描 PDF「02.pdf」。OCR 抽取失败未能获得任何文字内容，无法识别地块编号。建议重新进行 OCR 识别。";

  it("does not force vision just because the user clicked refresh", () => {
    expect(
      shouldPreferVisionForParse({
        cachedSummary: "可复制合同正文摘要，各方权利义务已列明。",
      }),
    ).toBe(false);
  });

  it("uses vision for images and OCR-failure scan summaries", () => {
    expect(shouldPreferVisionForParse({ isImage: true })).toBe(true);
    expect(shouldPreferVisionForParse({ cachedSummary: survey })).toBe(true);
  });
});
