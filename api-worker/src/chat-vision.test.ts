import { afterEach, describe, expect, it } from "vitest";
import {
  attachVisionToLastUserMessage,
  pdfTextLooksTooSparseForSkipVision,
  QWEN_VL_MODEL_DEFAULT,
  VL_IMAGE_RAW_MAX,
  visionImagesFromFileBytes,
  vlModelName,
} from "./chat-vision";
import { callLlm } from "./llm-client";
import { encodePngRgba } from "./png-encode";

describe("vlModelName", () => {
  it("defaults to qwen3-vl-plus", () => {
    expect(QWEN_VL_MODEL_DEFAULT).toBe("qwen3-vl-plus");
    expect(vlModelName({})).toBe("qwen3-vl-plus");
    expect(vlModelName({ QWEN_VL_MODEL: " qwen3-vl-plus " })).toBe("qwen3-vl-plus");
  });
});

describe("attachVisionToLastUserMessage", () => {
  it("puts images before the look-at-figure hint on the last user turn", () => {
    const out = attachVisionToLastUserMessage(
      [
        { role: "system", content: "sys" },
        { role: "user", content: "四至是什么" },
      ],
      [{ dataUrl: "data:image/png;base64,xx", label: "测绘图.pdf" }],
    );
    const last = out[out.length - 1]!;
    expect(Array.isArray(last.content)).toBe(true);
    const parts = last.content as Array<Record<string, unknown>>;
    expect(parts[0]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,xx" },
    });
    expect(parts[1]).toMatchObject({ type: "text" });
    expect(String((parts[1] as { text: string }).text)).toMatch(/看图/);
    expect(out[0]?.content).toBe("sys");
  });

  it("always sends image_url, never type=file (Dashscope compatible-mode rejects file)", () => {
    const out = attachVisionToLastUserMessage(
      [{ role: "user", content: "读这张测绘图" }],
      [{ dataUrl: "data:image/png;base64,xx", label: "scan.pdf 第1页" }],
    );
    const parts = out[0]!.content as Array<Record<string, unknown>>;
    expect(parts.map((p) => p.type)).toEqual(["image_url", "text"]);
    expect(JSON.stringify(parts)).not.toContain('"file"');
  });
});

describe("callLlm vision", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts qwen3-vl-plus with image_url and skips Hermes", async () => {
    let url = "";
    let body = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      body = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "北至公路，南至海岸" } }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await callLlm(
      {
        DASHSCOPE_API_KEY: "sk-test",
        DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        HERMES_BASE_URL: "http://hermes:8642",
        HERMES_API_KEY: "hermes-key-16chars",
        QWEN_VL_MODEL: "qwen3-vl-plus",
      },
      attachVisionToLastUserMessage(
        [{ role: "user", content: "图上编号是什么" }],
        [{ dataUrl: "data:image/jpeg;base64,abc", label: "site.jpg" }],
      ),
      { forceDashscope: true, model: "qwen3-vl-plus" },
    );

    expect(url).toContain("/chat/completions");
    expect(url).not.toContain("hermes");
    expect(body).toContain("qwen3-vl-plus");
    expect(body).toContain("image_url");
    expect(body).toContain("data:image/jpeg;base64,abc");
    expect(result.llmBackend).toBe("dashscope-vl");
    expect(result.answer).toContain("北至公路");
  });
});

describe("pdfTextLooksTooSparseForSkipVision", () => {
  it("treats a short survey-map text layer as needing vision", () => {
    expect(
      pdfTextLooksTooSparseForSkipVision(
        "【测绘图.pdf · PDF 提取正文】\nSP265790 Stone Island",
        2,
      ),
    ).toBe(true);
  });

  it("keeps a dense copyable PDF on the text path", () => {
    const body = "本合同各方同意如下条款。".repeat(80);
    expect(pdfTextLooksTooSparseForSkipVision(`【合同.pdf · PDF 提取正文】\n${body}`, 2)).toBe(
      false,
    );
  });
});

describe("visionImagesFromFileBytes", () => {
  it("wraps a raster image as a data URL for source-file parse", async () => {
    const png = await encodePngRgba(1, 1, new Uint8Array([255, 0, 0, 255]), 4);
    const images = await visionImagesFromFileBytes({
      fileName: "现场.png",
      mime: "image/png",
      bytes: png,
    });
    expect(images).toHaveLength(1);
    expect(images[0]?.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("compresses oversized images via node helper instead of dropping them", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/__jfo/internal/image-compress");
      return new Response(
        JSON.stringify({
          mime: "image/jpeg",
          dataUrl: "data:image/jpeg;base64,abc",
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const bytes = new Uint8Array(VL_IMAGE_RAW_MAX + 8);
      const images = await visionImagesFromFileBytes({
        fileName: "04 岛屿总体规划图_StoneIsland Master Plan.jpg",
        mime: "image/jpeg",
        bytes,
        rasterEnv: {
          JFO_NODE_HELPER_BASE: "http://127.0.0.1:8791",
          JFO_INTERNAL_KEY: "k",
        },
      });
      expect(images).toHaveLength(1);
      expect(images[0]?.dataUrl).toBe("data:image/jpeg;base64,abc");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
