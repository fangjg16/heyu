import assert from "node:assert/strict";
import {
  listHermesChatCompletionsUrls,
  listHermesRunsPostUrls,
  normalizeHermesBaseUrl,
} from "../src/hermes-url.ts";

assert.equal(
  normalizeHermesBaseUrl("http://127.0.0.1:8791/__jfo/internal/hermes"),
  "http://127.0.0.1:8791/__jfo/internal/hermes",
);
assert.ok(
  listHermesChatCompletionsUrls("http://127.0.0.1:8791/__jfo/internal/hermes").includes(
    "http://127.0.0.1:8791/__jfo/internal/hermes/v1/chat/completions",
  ),
);
assert.ok(
  listHermesRunsPostUrls("http://127.0.0.1:8791/__jfo/internal/hermes").includes(
    "http://127.0.0.1:8791/__jfo/internal/hermes/v1/runs",
  ),
);
assert.equal(normalizeHermesBaseUrl("http://hermes:8642/"), "http://hermes:8642");

console.log("hermes-url: ok");
