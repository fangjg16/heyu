import { afterEach, describe, expect, it } from "vitest";
import {
  attachVisionToLastUserMessage,
  QWEN_VL_MODEL_DEFAULT,
  vlModelName,
} from "./chat-vision";
import { callLlm } from "./llm-client";

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

  it("sends scan PDFs without page images as file_data", () => {
    const out = attachVisionToLastUserMessage(
      [{ role: "user", content: "读这张测绘图" }],
      [
        {
          dataUrl: "data:application/pdf;base64,JVBERg",
          label: "scan.pdf",
          asFile: true,
        },
      ],
    );
    const parts = out[0]!.content as Array<Record<string, unknown>>;
    expect(parts[0]).toEqual({
      type: "file",
      file: {
        filename: "scan.pdf",
        file_data: "data:application/pdf;base64,JVBERg",
      },
    });
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
