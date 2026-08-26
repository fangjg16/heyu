import { describe, expect, it } from "vitest";
import {
  LIST_FILES_LIMIT,
  LIST_FILES_SQL,
  LIST_FILES_SQL_LEGACY,
  LIST_FILES_SQL_NO_BYTE_SIZE,
  LIST_FILES_SQL_NO_COLLAB,
  LIST_FILES_SQL_NO_PARSE,
  LIST_FILES_SQL_NO_SOFT_DELETE,
  documentAccessError,
  listFilesSqlWithSessionVisibility,
} from "./documents-access";

const LIST_SQLS = [
  LIST_FILES_SQL,
  LIST_FILES_SQL_NO_COLLAB,
  LIST_FILES_SQL_LEGACY,
  LIST_FILES_SQL_NO_SOFT_DELETE,
  LIST_FILES_SQL_NO_PARSE,
  LIST_FILES_SQL_NO_BYTE_SIZE,
];

describe("LIST_FILES_LIMIT", () => {
  it("keeps enough rows that early numbered folders are not dropped by recency", () => {
    expect(LIST_FILES_LIMIT).toBeGreaterThanOrEqual(2000);
    for (const sql of LIST_SQLS) {
      expect(sql).toMatch(new RegExp(`LIMIT\\s+${LIST_FILES_LIMIT}\\s*$`, "m"));
      expect(sql).not.toMatch(/LIMIT\s+200\s*$/m);
    }
  });
});

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
