import { describe, expect, it } from "vitest";
import {
  PARSE_VISION_SYSTEM,
  buildSourceFileParseMessages,
  sourceParseVisionLlmOptions,
} from "./source-parse-vision";

describe("buildSourceFileParseMessages", () => {
  it("uses vision system + image_url for a scan PDF", () => {
    const messages = buildSourceFileParseMessages({
      filename: "02_大陆地块测绘图_SP265790.pdf",
      mime: "application/pdf",
      sourceText: "（扫描 PDF「测绘图.pdf」OCR 未抽出文字。）",
      images: [{ dataUrl: "data:image/png;base64,xx", label: "测绘图.pdf" }],
    });
    expect(messages[0]?.content).toBe(PARSE_VISION_SYSTEM);
    expect(PARSE_VISION_SYSTEM).toMatch(/禁止写「OCR/);
    const user = messages[1]!;
    expect(Array.isArray(user.content)).toBe(true);
    const parts = user.content as Array<Record<string, unknown>>;
    expect(parts[0]).toMatchObject({ type: "image_url" });
    expect(String((parts[1] as { text: string }).text)).toMatch(/直接阅读图面/);
    expect(String((parts[1] as { text: string }).text)).not.toMatch(/OCR 未抽出/);
  });

  it("keeps a text-only prompt for copyable documents", () => {
    const messages = buildSourceFileParseMessages({
      filename: "访谈纪要.txt",
      mime: "text/plain",
      sourceText: "纪要正文。",
      images: [],
    });
    expect(typeof messages[0]?.content).toBe("string");
    expect(String(messages[0]?.content)).not.toMatch(/图面/);
    expect(messages[1]?.content).toContain("纪要正文");
  });
});

describe("sourceParseVisionLlmOptions", () => {
  it("forces Dashscope qwen3-vl-plus", () => {
    expect(sourceParseVisionLlmOptions({})).toEqual({
      forceDashscope: true,
      model: "qwen3-vl-plus",
    });
  });
});
