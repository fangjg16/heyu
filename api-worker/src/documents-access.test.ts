import { describe, expect, it } from "vitest";
import {
  LIST_FILES_SQL,
  LIST_FILES_SQL_LEGACY,
  LIST_FILES_SQL_NO_BYTE_SIZE,
  LIST_FILES_SQL_NO_COLLAB,
  LIST_FILES_SQL_NO_PARSE,
  LIST_FILES_SQL_NO_SOFT_DELETE,
  documentAccessError,
  listFilesSqlWithSessionVisibility,
  remapRelativePathAfterFolderRename,
  sanitizeDocumentFilename,
} from "./documents-access";

const LIST_SQLS = [
  LIST_FILES_SQL,
  LIST_FILES_SQL_NO_COLLAB,
  LIST_FILES_SQL_LEGACY,
  LIST_FILES_SQL_NO_SOFT_DELETE,
  LIST_FILES_SQL_NO_PARSE,
  LIST_FILES_SQL_NO_BYTE_SIZE,
];

describe("listFilesSqlWithSessionVisibility", () => {
  it("keeps own-session filter for non-admin listing", () => {
    for (const sql of LIST_SQLS) {
      const vis = listFilesSqlWithSessionVisibility(sql, false);
      expect(vis.bindUserId).toBe(true);
      expect(vis.sql).toContain(
        "(d.scope = 'package' OR (d.scope = 'session' AND d.uploaded_by = ?))",
      );
      expect(vis.sql).toBe(sql);
    }
  });

  it("lets Admin list every session upload without a user bind", () => {
    for (const sql of LIST_SQLS) {
      const vis = listFilesSqlWithSessionVisibility(sql, true);
      expect(vis.bindUserId).toBe(false);
      expect(vis.sql).toContain("(d.scope = 'package' OR d.scope = 'session')");
      expect(vis.sql).not.toContain("d.scope = 'session' AND d.uploaded_by = ?");
    }
  });
});

describe("documentAccessError", () => {
  it("allows package files for any viewer", () => {
    expect(
      documentAccessError({ scope: "package", uploaded_by: "a" }, "b"),
    ).toBeNull();
  });

  it("hides other people's session files unless viewAllSession", () => {
    expect(
      documentAccessError({ scope: "session", uploaded_by: "a" }, "b"),
    ).toBe("文档不存在或无权访问");
    expect(
      documentAccessError(
        { scope: "session", uploaded_by: "a" },
        "b",
        { viewAllSession: true },
      ),
    ).toBeNull();
    expect(
      documentAccessError({ scope: "session", uploaded_by: "b" }, "b"),
    ).toBeNull();
  });
});

describe("sanitizeDocumentFilename", () => {
  it("rejects empty, path separators, and .keep", () => {
    expect(sanitizeDocumentFilename("  ")).toBeNull();
    expect(sanitizeDocumentFilename("a/b.pdf")).toBeNull();
    expect(sanitizeDocumentFilename(".keep")).toBeNull();
    expect(sanitizeDocumentFilename("访谈纪要.pdf")).toBe("访谈纪要.pdf");
  });
});

describe("remapRelativePathAfterFolderRename", () => {
  it("rewrites the folder and nested children", () => {
    expect(
      remapRelativePathAfterFolderRename(
        "项目上传的/旧文件夹",
        "项目上传的/旧文件夹",
        "项目上传的/新文件夹",
      ),
    ).toBe("项目上传的/新文件夹");
    expect(
      remapRelativePathAfterFolderRename(
        "项目上传的/旧文件夹/子",
        "项目上传的/旧文件夹",
        "项目上传的/新文件夹",
      ),
    ).toBe("项目上传的/新文件夹/子");
    expect(
      remapRelativePathAfterFolderRename(
        "项目上传的/别的",
        "项目上传的/旧文件夹",
        "项目上传的/新文件夹",
      ),
    ).toBe("项目上传的/别的");
  });
});
