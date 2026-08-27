import { describe, expect, it } from "vitest";
import {
  parseDetailPendingText,
  resolveParseUiStatus,
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
