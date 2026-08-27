import { describe, expect, it } from "vitest";
import {
  extractOcrTextFromResponse,
  OCR_IMAGE_RAW_MAX,
  ocrImageWithQwen,
  ocrPdfWithQwen,
} from "./qwen-ocr";

describe("extractOcrTextFromResponse", () => {
  it("reads chat completions content", () => {
    expect(
      extractOcrTextFromResponse({
        choices: [{ message: { content: "票面金额 100" } }],
      }),
    ).toBe("票面金额 100");
  });

  it("prefers ocr_result on responses API", () => {
    expect(
      extractOcrTextFromResponse({
        output: [{ content: [{ ocr_result: "扫描页一", text: "ignored" }] }],
      }),
    ).toContain("扫描页一");
  });
});

describe("ocrImageWithQwen", () => {
  it("refuses oversized images without calling fetch", async () => {
    let called = 0;
    const r = await ocrImageWithQwen(
      { DASHSCOPE_API_KEY: "sk" },
      {
        bytes: new Uint8Array(OCR_IMAGE_RAW_MAX + 10),
        fileName: "huge.png",
        mimeType: "image/png",
        fetchImpl: (async () => {
          called += 1;
          return new Response("{}");
        }) as typeof fetch,
      },
    );
    expect(called).toBe(0);
    expect(r.ok).toBe(false);
    expect(r.warning).toMatch(/7MB|Base64/u);
  });
});

describe("ocrPdfWithQwen", () => {
  it("posts to /responses with document_parsing", async () => {
    const urls: string[] = [];
    let body = "";
    const r = await ocrPdfWithQwen(
      {
        DASHSCOPE_API_KEY: "sk",
        DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
      {
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
        fileName: "scan.pdf",
        fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
          urls.push(String(input));
          body = String(init?.body ?? "");
          return new Response(
            JSON.stringify({
              output: [{ content: [{ ocr_result: "扫描合同正文" }] }],
            }),
            { status: 200 },
          );
        }) as typeof fetch,
      },
    );
    expect(urls[0]).toContain("/responses");
    expect(body).toContain("document_parsing");
    expect(body).toContain("qwen3.5-ocr");
    expect(r.ok).toBe(true);
    expect(r.text).toContain("扫描合同正文");
  });
});
