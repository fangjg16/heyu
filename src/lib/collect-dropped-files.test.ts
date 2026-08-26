import { describe, expect, it } from "vitest";
import { relativePathFromWebkitFile } from "./unzip-project-files";
import {
  collectDroppedFiles,
  fileWithRelativePath,
  isLikelyDirectoryPlaceholder,
  type DropFsEntry,
} from "./collect-dropped-files";

function mockFileEntry(name: string, file: File): DropFsEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (ok) => ok(file),
  };
}

function mockDirEntry(name: string, children: DropFsEntry[]): DropFsEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let sent = false;
      return {
        readEntries: (ok) => {
          if (sent) {
            ok([]);
            return;
          }
          sent = true;
          ok(children);
        },
      };
    },
  };
}

function pagedDirEntry(name: string, batches: DropFsEntry[][]): DropFsEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let i = 0;
      return {
        readEntries: (ok) => {
          if (i >= batches.length) {
            ok([]);
            return;
          }
          ok(batches[i++]!);
        },
      };
    },
  };
}

describe("isLikelyDirectoryPlaceholder", () => {
  it("flags the Chrome folder stub (0 bytes, no type, no extension)", () => {
    const stub = new File([], "20260722 万嗣芳老师访谈", { type: "" });
    expect(isLikelyDirectoryPlaceholder(stub)).toBe(true);
  });

  it("keeps real empty files that have an extension", () => {
    const empty = new File([], "notes.txt", { type: "text/plain" });
    expect(isLikelyDirectoryPlaceholder(empty)).toBe(false);
  });
});

describe("collectDroppedFiles", () => {
  it("walks a dropped folder and keeps webkitRelativePath for nesting", async () => {
    const pdf = new File(["pdf-bytes"], "访谈纪要.pdf", { type: "application/pdf" });
    const nested = new File(["ok"], "附录.txt", { type: "text/plain" });
    const folder = mockDirEntry("20260722 万嗣芳老师访谈", [
      mockFileEntry("访谈纪要.pdf", pdf),
      mockDirEntry("附件", [mockFileEntry("附录.txt", nested)]),
      mockFileEntry(".DS_Store", new File([""], ".DS_Store")),
    ]);

    const files = await collectDroppedFiles({ entries: [folder], files: [] });
    const paths = files
      .map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath)
      .sort();
    expect(paths).toEqual([
      "20260722 万嗣芳老师访谈/访谈纪要.pdf",
      "20260722 万嗣芳老师访谈/附件/附录.txt",
    ]);
    const pdfFile = files.find((f) => f.name === "访谈纪要.pdf")!;
    const nestedFile = files.find((f) => f.name === "附录.txt")!;
    expect(relativePathFromWebkitFile(pdfFile, "项目上传")).toBe(
      "项目上传/20260722 万嗣芳老师访谈",
    );
    expect(relativePathFromWebkitFile(nestedFile, "项目上传")).toBe(
      "项目上传/20260722 万嗣芳老师访谈/附件",
    );
  });

  it("can collect several folders in one drop", async () => {
    const a = mockDirEntry("夹A", [
      mockFileEntry("a.txt", new File(["a"], "a.txt", { type: "text/plain" })),
    ]);
    const b = mockDirEntry("夹B", [
      mockFileEntry("b.txt", new File(["b"], "b.txt", { type: "text/plain" })),
    ]);
    const files = await collectDroppedFiles({ entries: [a, b], files: [] });
    expect(files.map((f) => f.name).sort()).toEqual(["a.txt", "b.txt"]);
  });

  it("reads directory entries across paginated readEntries calls", async () => {
    const dir = pagedDirEntry("大夹", [
      [mockFileEntry("1.txt", new File(["1"], "1.txt", { type: "text/plain" }))],
      [mockFileEntry("2.txt", new File(["2"], "2.txt", { type: "text/plain" }))],
    ]);
    const files = await collectDroppedFiles({ entries: [dir], files: [] });
    expect(files.map((f) => f.name).sort()).toEqual(["1.txt", "2.txt"]);
  });

  it("drops the directory placeholder when entries are unavailable", async () => {
    const stub = new File([], "20260722 万嗣芳老师访谈", { type: "" });
    const real = new File(["hi"], "readme.md", { type: "text/markdown" });
    const files = await collectDroppedFiles({ entries: [], files: [stub, real] });
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe("readme.md");
  });

  it("returns empty instead of uploading a lone folder stub", async () => {
    const stub = new File([], "20260722 万嗣芳老师访谈", { type: "" });
    const files = await collectDroppedFiles({ entries: [], files: [stub] });
    expect(files).toEqual([]);
  });

  it("fileWithRelativePath is used by loose files from file entries", async () => {
    const file = new File(["x"], "solo.pdf", { type: "application/pdf" });
    const files = await collectDroppedFiles({
      entries: [mockFileEntry("solo.pdf", file)],
      files: [],
    });
    expect(files).toHaveLength(1);
    expect((files[0] as File & { webkitRelativePath?: string }).webkitRelativePath).toBe(
      "solo.pdf",
    );
    expect(relativePathFromWebkitFile(files[0]!, "项目上传")).toBe("项目上传");
  });
});

describe("fileWithRelativePath", () => {
  it("copies when the original path cannot be rewritten", () => {
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    const next = fileWithRelativePath(file, "夹/a.txt");
    expect((next as File & { webkitRelativePath?: string }).webkitRelativePath).toBe(
      "夹/a.txt",
    );
  });
});
