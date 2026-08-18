import assert from "node:assert/strict";
import {
  HERMES_NODE_PROXY_PREFIX,
  buildHermesUpstreamUrl,
  copyRequestHeaders,
  formatHermesProxyConnectError,
  hermesProxyWorkerBase,
  isLoopbackAddress,
  shouldSkipResponseHeader,
} from "./hermes-node-proxy.mjs";

assert.equal(HERMES_NODE_PROXY_PREFIX, "/__jfo/internal/hermes");
assert.equal(
  hermesProxyWorkerBase("http://127.0.0.1:8787"),
  "http://127.0.0.1:8787/__jfo/internal/hermes",
);
assert.equal(hermesProxyWorkerBase("http://127.0.0.1:8787/"), "http://127.0.0.1:8787/__jfo/internal/hermes");
assert.equal(hermesProxyWorkerBase(""), "");

assert.equal(
  buildHermesUpstreamUrl("http://hermes:8642", "/__jfo/internal/hermes/v1/chat/completions"),
  "http://hermes:8642/v1/chat/completions",
);
assert.equal(
  buildHermesUpstreamUrl("http://hermes:8642/", "/__jfo/internal/hermes/v1/runs?x=1"),
  "http://hermes:8642/v1/runs?x=1",
);
assert.equal(
  buildHermesUpstreamUrl("http://hermes:8642", "/__jfo/internal/hermes"),
  "http://hermes:8642/",
);
assert.equal(buildHermesUpstreamUrl("", "/__jfo/internal/hermes/v1/models"), "");

assert.equal(isLoopbackAddress("127.0.0.1"), true);
assert.equal(isLoopbackAddress("::1"), true);
assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
assert.equal(isLoopbackAddress("172.18.0.9"), false);
assert.equal(isLoopbackAddress(""), false);

const headers = copyRequestHeaders({
  host: "127.0.0.1:8787",
  authorization: "Bearer abc",
  "content-type": "application/json",
  connection: "keep-alive",
  "content-length": "12",
});
assert.equal(headers.get("authorization"), "Bearer abc");
assert.equal(headers.get("content-type"), "application/json");
assert.equal(headers.has("host"), false);
assert.equal(headers.has("connection"), false);

assert.equal(shouldSkipResponseHeader("Transfer-Encoding"), true);
assert.equal(shouldSkipResponseHeader("Content-Type"), false);

assert.match(
  formatHermesProxyConnectError(new Error("fetch failed")),
  /Hermes 上游不可达：fetch failed/,
);

console.log("hermes-node-proxy: ok");
