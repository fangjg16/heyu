import { describe, expect, it } from "vitest";
import {
  assembleChapterMaterialsDigest,
  chapterRetrievalQuery,
  extractMaterialQueryTokens,
  selectMustReadDocs,
} from "./project-knowledge-chapters-digest";
import type { ChunkRow } from "./search";

describe("extractMaterialQueryTokens", () => {
  it("pulls 剧云 and jucloud out of a spoken revise instruction", () => {
    const tokens = extractMaterialQueryTokens(
      "国内很重要的对标对象是 剧云 jucloud, 在源文件中也有相关资料, 但是为什么这里没有显示",
    );
    expect(tokens).toContain("剧云");
    expect(tokens.some((t) => t.toLowerCase() === "jucloud")).toBe(true);
    expect(tokens.some((t) => t.includes("但是为什么"))).toBe(false);
  });
});

describe("three-layer chapter materials", () => {
  const docs = [
    {
      id: "bp",
      filename: "商业计划书.pdf",
      relative_path: null,
      mime: "application/pdf",
    },
    {
      id: "cmp",
      filename: "剧云 jucloud 对标对比.xlsx",
      relative_path: "对标",
      mime: "application/vnd.ms-excel",
    },
    {
      id: "fin",
      filename: "财务模型.xlsx",
      relative_path: null,
      mime: "application/vnd.ms-excel",
    },
  ];

  const parseMap = new Map([
    [
      "bp",
      {
        document_id: "bp",
        summary: "早期 AI 剧本工具商业计划。",
        document_type: "BP",
        key_points_json: JSON.stringify(["产品形态", "定价"]),
      },
    ],
    [
      "cmp",
      {
        document_id: "cmp",
        summary: "国内对标剧云 Jucloud 的功能与合规对比。",
        document_type: "对标表",
        key_points_json: JSON.stringify(["剧云", "合规差异"]),
      },
    ],
    [
      "fin",
      {
        document_id: "fin",
        summary: "回报测算底稿。",
        document_type: "财务模型",
        key_points_json: JSON.stringify(["IRR"]),
      },
    ],
  ]);

  const chunk = (
    id: string,
    documentId: string,
    text: string,
    index = 0,
  ): ChunkRow => ({
    id,
    document_id: documentId,
    chunk_index: index,
    text,
    filename: docs.find((d) => d.id === documentId)?.filename,
    scope: "package",
  });

  const byDoc = new Map<string, ChunkRow[]>([
    ["bp", [chunk("c-bp", "bp", "BP 正文：海外对标 GPT Claude。")]],
    [
      "cmp",
      [
        chunk(
          "c-cmp",
          "cmp",
          "对比表：剧云 Jucloud 是国内 AI 剧本工具，版权与合规与海外工具不同。",
        ),
      ],
    ],
    ["fin", [chunk("c-fin", "fin", "IRR 25% 仅供测算。")]],
  ]);

  it("keeps every file in the catalog even when only some are must-read", () => {
    const mustRead = selectMustReadDocs(docs, parseMap, byDoc, "benchmarks");
    expect(mustRead.some((d) => d.id === "cmp")).toBe(true);
    expect(mustRead.some((d) => d.id === "fin")).toBe(false);

    const { digest } = assembleChapterMaterialsDigest({
      docs,
      parseMap,
      byDoc,
      mustRead,
      supplement: byDoc.get("bp") ?? [],
      sectionId: "benchmarks",
    });
    expect(digest).toContain("【资料目录 · 项目资料】");
    expect(digest).toContain("商业计划书.pdf");
    expect(digest).toContain("剧云 jucloud 对标对比.xlsx");
    expect(digest).toContain("财务模型.xlsx");
    expect(digest).toContain("位置：对标");
    expect(digest).toContain("禁止自造 [Research]");
    expect(digest).toContain("【本章深读 · must-read 全文】");
    expect(digest).toContain("剧云 Jucloud 是国内 AI 剧本工具");
    expect(digest).not.toContain("IRR 25%");
    expect(digest).toContain("【相关段落补充");
    expect(digest).toContain("BP 正文");
  });

  it("builds a chapter-specific retrieval query", () => {
    expect(chapterRetrievalQuery("benchmarks")).toContain("对标");
    expect(chapterRetrievalQuery("benchmarks", "补上剧云")).toContain("剧云");
  });

  it("boosts preferred AI-generated filenames into must-read", () => {
    const extra = {
      id: "md",
      filename: "market-analysis.md",
      relative_path: "AI生成/startup/01-discovery",
      mime: "text/markdown",
    };
    const mustRead = selectMustReadDocs(
      [...docs, extra],
      parseMap,
      new Map([...byDoc, ["md", []]]),
      "market-analysis",
      "",
      8,
      ["market-analysis.md"],
    );
    expect(mustRead.some((d) => d.id === "md")).toBe(true);
  });
});
