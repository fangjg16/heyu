import { describe, expect, it } from "vitest";
import {
  parseDetailPendingText,
  resolveParseUiStatus,
  shouldRefetchParseSummary,
} from "./parse-ui-status";

describe("resolveParseUiStatus", () => {
  it("shows parsing only for first-time in-flight", () => {
    expect(
      resolveParseUiStatus({
        fileId: "a",
        parsingId: "a",
        dbParsed: false,
      }),
    ).toBe("parsing");
  });

  it("shows parsing while in-flight even if the DB already marked the file parsed", () => {
    expect(
      resolveParseUiStatus({
        fileId: "a",
        parsingId: "a",
        dbParsed: true,
      }),
    ).toBe("parsing");
  });

  it("keeps parsed when cache is already loaded", () => {
    expect(
      resolveParseUiStatus({
        fileId: "a",
        parsingId: "a",
        cacheStatus: "parsed",
        dbParsed: true,
      }),
    ).toBe("parsed");
  });
});

describe("parseDetailPendingText", () => {
  it("uses 解析 copy for first parse and 加载详情 for cached files", () => {
    expect(
      parseDetailPendingText({ ui: "parsing", dbParsed: false }),
    ).toBe("正在解析…");
    expect(
      parseDetailPendingText({ ui: "parsed", dbParsed: true }),
    ).toBe("加载详情中…");
  });
});

describe("shouldRefetchParseSummary", () => {
  it("refetches OCR-empty scans so vision can read the figure", () => {
    expect(shouldRefetchParseSummary("（扫描 PDF「a.pdf」OCR 未抽出文字。）")).toBe(
      true,
    );
  });

  it("does not loop after vision already failed", () => {
    expect(shouldRefetchParseSummary("视觉理解未能读出图面：模型超时")).toBe(false);
  });

  it("refetches the survey-map OCR paraphrase", () => {
    expect(
      shouldRefetchParseSummary(
        "原文为扫描 PDF「02_大陆地块测绘图_SP265790.pdf」。OCR 抽取失败未能获得任何文字内容，无法识别地块编号。建议重新进行 OCR 识别。",
      ),
    ).toBe(true);
  });
});
