import { describe, expect, it } from "vitest";
import {
  collectChatFileIds,
  isChatVisionLookFile,
  shouldWarnUnparsedChatUpload,
} from "./chat-vision-files";

describe("isChatVisionLookFile", () => {
  it("treats scan PDFs and raster images as vision inputs", () => {
    expect(isChatVisionLookFile("02_大陆地块测绘图_SP265790.pdf")).toBe(true);
    expect(isChatVisionLookFile("现场.jpg")).toBe(true);
    expect(isChatVisionLookFile("note.png")).toBe(true);
    expect(isChatVisionLookFile("纪要.docx")).toBe(false);
    expect(isChatVisionLookFile("摘录.txt")).toBe(false);
  });
});

describe("collectChatFileIds", () => {
  it("keeps source-file ids and uploaded document ids without duplicates", () => {
    expect(collectChatFileIds(["doc-1", "", "doc-1", "up-9", undefined])).toEqual([
      "doc-1",
      "up-9",
    ]);
  });
});

describe("shouldWarnUnparsedChatUpload", () => {
  it("does not tell users to replace a scan PDF with txt", () => {
    expect(
      shouldWarnUnparsedChatUpload({
        filename: "测绘图.pdf",
        parsed: false,
        chunks: 0,
        pdfWarning: "未能从 PDF 提取文字",
      }),
    ).toBe(false);
  });

  it("still warns for Word/text that did not ingest", () => {
    expect(
      shouldWarnUnparsedChatUpload({
        filename: "访谈.docx",
        parsed: false,
        chunks: 0,
      }),
    ).toBe(true);
  });
});
