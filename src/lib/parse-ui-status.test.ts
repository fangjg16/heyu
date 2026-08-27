import { describe, expect, it } from "vitest";
import {
  parseDetailPendingText,
  resolveParseUiStatus,
  shouldRefetchParseSummary,
  shouldSendParseRefresh,
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

  it("keeps parsed while fetching cached details for an already-parsed file", () => {
    expect(
      resolveParseUiStatus({
        fileId: "a",
        parsingId: "a",
        dbParsed: true,
      }),
    ).toBe("parsed");
  });

  it("shows parsing when the client cache is explicitly reparsing", () => {
    expect(
      resolveParseUiStatus({
        fileId: "a",
        parsingId: "a",
        cacheStatus: "parsing",
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
      parseDetailPendingText({
        ui: "parsed",
        dbParsed: true,
        inFlight: true,
      }),
    ).toBe("加载详情中…");
    expect(
      parseDetailPendingText({ ui: "parsed", dbParsed: true }),
    ).toBe(null);
    expect(
      parseDetailPendingText({
        ui: "parsing",
        dbParsed: true,
        forceRefresh: true,
      }),
    ).toBe("正在重新解析…");
  });
});

describe("shouldSendParseRefresh", () => {
  it("does not refresh just because the client cache is empty", () => {
    expect(shouldSendParseRefresh({ cachedSummary: "" })).toBe(false);
    expect(shouldSendParseRefresh({})).toBe(false);
  });

  it("sends refresh on the icon click or a stale client summary", () => {
    expect(shouldSendParseRefresh({ force: true })).toBe(true);
    expect(
      shouldSendParseRefresh({
        cachedSummary: "（扫描 PDF「a.pdf」OCR 未抽出文字。）",
      }),
    ).toBe(true);
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

  it("retries after the vision handoff pipeline banner", () => {
    expect(
      shouldRefetchParseSummary(
        "未能把扫描件/图片交给视觉模型阅读。请稍后点击重新解析。",
      ),
    ).toBe(true);
  });

  it("refetches the survey-map OCR paraphrase", () => {
    expect(
      shouldRefetchParseSummary(
        "原文为扫描 PDF「02_大陆地块测绘图_SP265790.pdf」。OCR 抽取失败未能获得任何文字内容，无法识别地块编号。建议重新进行 OCR 识别。",
      ),
    ).toBe(true);
  });
});
