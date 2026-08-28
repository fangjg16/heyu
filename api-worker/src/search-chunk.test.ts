import { describe, expect, it } from "vitest";
import {
  chunkPlainText,
  filenameMatchesPriority,
  normalizeFilenameForMatch,
  selectChunksForChat,
  type ChunkRow,
} from "./search";

describe("chunkPlainText", () => {
  it("caps chunk count so huge markdown does not explode", () => {
    const text = "a".repeat(900 * 200);
    expect(chunkPlainText(text).length).toBe(120);
    expect(chunkPlainText(text, 900, 10).length).toBe(10);
  });
});

describe("filenameMatchesPriority", () => {
  it("treats underscore, space, and extra dots as the same file", () => {
    expect(
      normalizeFilenameForMatch("02_Whitsunday区域旅游业宏观信息..pdf"),
    ).toBe(normalizeFilenameForMatch("02 Whitsunday区域旅游业宏观信息.pdf"));
    expect(
      filenameMatchesPriority("02_Whitsunday区域旅游业宏观信息..pdf", [
        "02_Whitsunday区域旅游业宏观信息.pdf",
      ]),
    ).toBe(true);
  });
});

describe("selectChunksForChat named package files", () => {
  const chunks: ChunkRow[] = [
    {
      id: "other-1",
      document_id: "other",
      chunk_index: 0,
      text: "无关的财务模型假设和估值测算段落。",
      filename: "财务模型.xlsx",
      scope: "package",
    },
    {
      id: "named-1",
      document_id: "whitsunday",
      chunk_index: 0,
      text: "Jay Mac forwarded two council newsletter links about Shute Harbour.",
      filename: "02_Whitsunday区域旅游业宏观信息.pdf",
      scope: "package",
    },
  ];

  it("puts the named package file first even when the query does not mention it", () => {
    const hits = selectChunksForChat(chunks, "帮我整理一下文件中链接跳转网页的信息", {
      deep: false,
      maxChars: 8000,
      topK: 5,
      prioritizeFilenames: ["02_Whitsunday区域旅游业宏观信息.pdf"],
      prioritizeDocumentIds: ["whitsunday"],
    });
    expect(hits[0]?.id).toBe("named-1");
  });
});
