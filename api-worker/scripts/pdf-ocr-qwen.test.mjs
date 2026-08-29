import assert from "node:assert/strict";
import { ocrLargePdfInNode } from "./pdf-ocr-qwen.mjs";

const originalFetch = globalThis.fetch;
const urls = [];
globalThis.fetch = async (input, init) => {
  const url = String(input);
  urls.push(url);
  if (url.endsWith("/files")) {
    return new Response(JSON.stringify({ id: "file-ocr-1" }), { status: 200 });
  }
  if (url.endsWith("/responses")) {
    return new Response(
      JSON.stringify({
        output: [{ content: [{ ocr_result: "演员名单 巨东" }] }],
      }),
      { status: 200 },
    );
  }
  return new Response("{}", { status: 500 });
};

try {
  const bytes = new Uint8Array(32);
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const r = await ocrLargePdfInNode(bytes, {
    apiKey: "sk",
    base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.5-ocr",
    fileName: "巨东导演演员合集.pdf",
    maxPages: 50,
  });
  assert.equal(r.ok, true);
  assert.match(r.text, /演员名单/);
  assert.ok(urls.some((u) => u.endsWith("/files")));
  assert.ok(urls.some((u) => u.endsWith("/responses")));
  console.log("pdf-ocr-qwen: ok");
} finally {
  globalThis.fetch = originalFetch;
}
