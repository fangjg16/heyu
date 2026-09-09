import assert from "node:assert/strict";
import {
  parseDetailPendingText,
  resolveParseUiStatus,
  shouldSendParseRefresh,
} from "../src/lib/parse-ui-status.ts";

assert.equal(
  resolveParseUiStatus({ fileId: "a", parsingId: "a", dbParsed: false }),
  "parsing",
);
assert.equal(
  resolveParseUiStatus({ fileId: "a", parsingId: "a", dbParsed: true }),
  "parsed",
);
assert.equal(
  resolveParseUiStatus({
    fileId: "a",
    parsingId: "a",
    cacheStatus: "parsing",
    dbParsed: true,
  }),
  "parsing",
);

assert.equal(
  parseDetailPendingText({ ui: "parsing", dbParsed: false }),
  "正在解析…",
);
assert.equal(
  parseDetailPendingText({ ui: "parsed", dbParsed: true, inFlight: true }),
  "加载详情中…",
);
assert.equal(parseDetailPendingText({ ui: "parsed", dbParsed: true }), null);
assert.equal(
  parseDetailPendingText({
    ui: "parsing",
    dbParsed: true,
    forceRefresh: true,
  }),
  "正在重新解析…",
);

assert.equal(shouldSendParseRefresh({ cachedSummary: "" }), false);
assert.equal(shouldSendParseRefresh({ force: true }), true);
assert.equal(shouldSendParseRefresh({ cachedSummary: "正在生成摘要…" }), false);

console.log("parse-ui-status: ok");
