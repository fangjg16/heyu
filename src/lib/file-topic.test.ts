import { describe, expect, it } from "vitest";
import {
  canonicalizeFileTopic,
  inferDocumentGenre,
  resolveFileTopic,
} from "./file-topic";

describe("inferDocumentGenre", () => {
  const news =
    "独家 | 清华北大普林斯顿天才少年, 用 “空间Agent” 重构AI健康硬件, 高瓴、智元投了.pdf";

  it("does not show 项目介绍 for a funding-news filename", () => {
    expect(
      inferDocumentGenre({ filename: news, documentType: "项目介绍" }),
    ).toBe("融资新闻稿");
  });

  it("keeps a dated genre from the model", () => {
    expect(
      inferDocumentGenre({
        filename: news,
        documentType: "融资新闻稿（36氪 · 2026-02）",
      }),
    ).toBe("融资新闻稿（36氪 · 2026-02）");
  });
});

describe("resolveFileTopic", () => {
  it("still groups funding news under 项目介绍", () => {
    const news =
      "独家 | 清华北大普林斯顿天才少年, 用 “空间Agent” 重构AI健康硬件, 高瓴、智元投了.pdf";
    expect(resolveFileTopic({ filename: news }).label).toBe("项目介绍");
    expect(canonicalizeFileTopic("融资新闻稿", news)).toBe("项目介绍");
  });
});
