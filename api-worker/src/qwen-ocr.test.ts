import { describe, expect, it } from "vitest";
import {
  extractOcrTextFromResponse,
  OCR_IMAGE_RAW_MAX,
  OCR_PDF_RAW_MAX,
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

  it("falls back to text_recognition when document_parsing returns no text", async () => {
    const tasks: string[] = [];
    const r = await ocrPdfWithQwen(
      {
        DASHSCOPE_API_KEY: "sk",
        DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
      {
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
        fileName: "map.pdf",
        fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = String(init?.body ?? "");
          const task = /"task":"([^"]+)"/u.exec(body)?.[1] ?? "";
          tasks.push(task);
          if (task === "document_parsing") {
            return new Response(JSON.stringify({ output: [] }), { status: 200 });
          }
          return new Response(
            JSON.stringify({
              output: [{ content: [{ ocr_result: "SP265790" }] }],
            }),
            { status: 200 },
          );
        }) as typeof fetch,
      },
    );
    expect(tasks).toEqual(["document_parsing", "text_recognition"]);
    expect(r.ok).toBe(true);
    expect(r.text).toContain("SP265790");
  });

  it("uploads oversized PDFs instead of asking to compress under 20MB", async () => {
    const urls: string[] = [];
    const bodies: string[] = [];
    const bytes = new Uint8Array(OCR_PDF_RAW_MAX + 32);
    bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const r = await ocrPdfWithQwen(
      {
        DASHSCOPE_API_KEY: "sk",
        DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
      {
        bytes,
        fileName: "巨东导演演员合集.pdf",
        fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          urls.push(url);
          bodies.push(String(init?.body ?? ""));
          if (url.endsWith("/files")) {
            return new Response(JSON.stringify({ id: "file-ocr-1" }), {
              status: 200,
            });
          }
          return new Response(
            JSON.stringify({
              output: [{ content: [{ ocr_result: "演员名单 巨东" }] }],
            }),
            { status: 200 },
          );
        }) as typeof fetch,
      },
    );
    expect(urls.some((u) => u.endsWith("/files"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/responses"))).toBe(true);
    expect(bodies.some((b) => b.includes("file-ocr-1"))).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.text).toContain("演员名单");
    expect(r.warning ?? "").not.toMatch(/压到 20MB/u);
  });

  it("falls back to page OCR when upload is rejected", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const bytes = new Uint8Array(OCR_PDF_RAW_MAX + 8);
    const r = await ocrPdfWithQwen(
      {
        DASHSCOPE_API_KEY: "sk",
        DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
      {
        bytes,
        fileName: "scan-big.pdf",
        pageCount: 2,
        renderPage: async (page) => (page <= 2 ? { mime: "image/png", bytes: png } : null),
        fetchImpl: (async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith("/files")) {
            return new Response(JSON.stringify({ error: { message: "too large" } }), {
              status: 413,
            });
          }
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: "扫描页文字" } }],
            }),
            { status: 200 },
          );
        }) as typeof fetch,
      },
    );
    expect(r.ok).toBe(true);
    expect(r.text).toContain("扫描页文字");
    expect(r.text).toContain("第1页");
  });

  it("rasters via node helper when upload is rejected", async () => {
    const urls: string[] = [];
    const bytes = new Uint8Array(OCR_PDF_RAW_MAX + 8);
    const r = await ocrPdfWithQwen(
      {
        DASHSCOPE_API_KEY: "sk",
        DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        JFO_NODE_HELPER_BASE: "http://127.0.0.1:8791",
        JFO_INTERNAL_KEY: "k",
      },
      {
        bytes,
        fileName: "scan-helper.pdf",
        pageCount: 1,
        fetchImpl: (async (input: RequestInfo | URL) => {
          const url = String(input);
          urls.push(url);
          if (url.endsWith("/files")) {
            return new Response(JSON.stringify({ error: { message: "too large" } }), {
              status: 413,
            });
          }
          if (url.includes("/__jfo/internal/pdf-page-png")) {
            return new Response(
              JSON.stringify({ dataUrl: "data:image/png;base64,iVBORw0KGgo=" }),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: "helper 栅格页" } }],
            }),
            { status: 200 },
          );
        }) as typeof fetch,
      },
    );
    expect(urls.some((u) => u.includes("/__jfo/internal/pdf-page-png"))).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.text).toContain("helper 栅格页");
  });

  it("does not ask to compress when helper is missing", async () => {
    const bytes = new Uint8Array(OCR_PDF_RAW_MAX + 8);
    const r = await ocrPdfWithQwen(
      {
        DASHSCOPE_API_KEY: "sk",
        DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
      {
        bytes,
        fileName: "scan-no-helper.pdf",
        pageCount: 1,
        fetchImpl: (async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith("/files")) {
            return new Response(JSON.stringify({ error: { message: "too large" } }), {
              status: 413,
            });
          }
          return new Response("{}", { status: 200 });
        }) as typeof fetch,
      },
    );
    expect(r.ok).toBe(false);
    expect(r.warning ?? "").toMatch(/JFO_NODE_HELPER_BASE/u);
    expect(r.warning ?? "").not.toMatch(/压到 20MB/u);
  });
});
