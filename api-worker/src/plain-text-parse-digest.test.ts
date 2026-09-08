import { describe, expect, it } from "vitest";
import {
  digestPlainTextSource,
  documentListLooksParsed,
  stripSourceDecorations,
} from "./plain-text-parse-digest";

describe("digestPlainTextSource", () => {
  it("takes headings and lead from a Chinese analysis draft", () => {
    const body = `# 差异化定位

演员 AI 版权经纪不是再做一个素材库。

## 谁在买

短剧团队要的是可授权形象，不是生成按钮。

一、对谁不说

不要对投资人讲模型参数。
`;
    const d = digestPlainTextSource({
      body,
      filename: "positioning.md",
      fileCategory: "差异化定位",
    });
    expect(d.documentType).toBe("差异化定位");
    expect(d.summary).toContain("不是再做一个素材库");
    expect(d.keyPoints).toEqual(
      expect.arrayContaining(["差异化定位", "谁在买", "对谁不说"]),
    );
  });

  it("strips extract headers", () => {
    expect(stripSourceDecorations("【a.md · 提取正文】\n# 标题\n\n一段。")).toBe(
      "# 标题\n\n一段。",
    );
  });
});

describe("documentListLooksParsed", () => {
  it("treats authored AI markdown as parsed without a summary row", () => {
    expect(
      documentListLooksParsed({
        parseCount: 0,
        chunkCount: 0,
        filename: "positioning.md",
        mime: "text/markdown",
        sourceKind: "ai_generated",
      }),
    ).toBe(true);
  });

  it("treats chunked markdown as parsed even without a summary row", () => {
    expect(
      documentListLooksParsed({
        parseCount: 0,
        chunkCount: 4,
        filename: "positioning.md",
        mime: "text/markdown",
      }),
    ).toBe(true);
  });

  it("does not treat unscanned PDF chunks-only as parsed", () => {
    expect(
      documentListLooksParsed({
        parseCount: 0,
        chunkCount: 2,
        filename: "合同.pdf",
        mime: "application/pdf",
      }),
    ).toBe(false);
  });
});
