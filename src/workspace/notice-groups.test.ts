import { describe, expect, it } from "vitest";
import type { ProjectNoticeItem } from "@/lib/project-api";
import {
  groupActivityNotices,
  isNoticeActivityKind,
  isNoticeTodoKind,
  parseNoticeFileSummary,
} from "./notice-groups";

function notice(
  partial: Partial<ProjectNoticeItem> & Pick<ProjectNoticeItem, "id">,
): ProjectNoticeItem {
  return {
    projectId: "p1",
    projectName: "储能项目",
    actorUserId: "u-jess",
    kind: "file_upload",
    title: "上传了项目资料",
    summary: "JessicaHu 上传了「储能项目」的项目资料 a.pdf",
    href: "/app/projects/p1/materials",
    createdAt: "2026-08-27T03:45:49.000Z",
    readAt: null,
    ...partial,
  };
}

describe("parseNoticeFileSummary", () => {
  it("reads actor, verb and filename", () => {
    expect(
      parseNoticeFileSummary(
        "JessicaHu 删除了「澳大利亚储能项目投资」的项目资料 .DS_Store",
      ),
    ).toEqual({
      actor: "JessicaHu",
      verb: "删除",
      project: "澳大利亚储能项目投资",
      filename: ".DS_Store",
    });
  });
});

describe("notice kind split", () => {
  it("treats file ops as activity and kn draft as todo", () => {
    expect(isNoticeActivityKind("file_delete")).toBe(true);
    expect(isNoticeActivityKind("kn_draft")).toBe(false);
    expect(isNoticeTodoKind("kn_draft")).toBe(true);
  });
});

describe("groupActivityNotices", () => {
  it("merges same actor / project / action within two hours", () => {
    const groups = groupActivityNotices([
      notice({
        id: "1",
        summary: "JessicaHu 上传了「储能项目」的项目资料 a.pdf",
        createdAt: "2026-08-27T04:00:00.000Z",
      }),
      notice({
        id: "2",
        summary: "JessicaHu 上传了「储能项目」的项目资料 b.pdf",
        createdAt: "2026-08-27T03:50:00.000Z",
      }),
      notice({
        id: "3",
        summary: "JessicaHu 上传了「储能项目」的项目资料 c.pdf",
        createdAt: "2026-08-27T03:40:00.000Z",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.ids).toEqual(["1", "2", "3"]);
    expect(groups[0]!.files).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
    expect(groups[0]!.summary).toBe("JessicaHu 上传了「储能项目」的 3 个文件");
    expect(groups[0]!.unread).toBe(true);
  });

  it("does not merge different actions or far-apart times", () => {
    const groups = groupActivityNotices([
      notice({
        id: "up",
        kind: "file_upload",
        title: "上传了项目资料",
        createdAt: "2026-08-27T04:00:00.000Z",
      }),
      notice({
        id: "del",
        kind: "file_delete",
        title: "删除了项目资料",
        summary: "JessicaHu 删除了「储能项目」的项目资料 a.pdf",
        createdAt: "2026-08-27T03:59:00.000Z",
      }),
      notice({
        id: "old",
        createdAt: "2026-08-26T04:00:00.000Z",
        readAt: "2026-08-26T05:00:00.000Z",
      }),
    ]);
    expect(groups.map((g) => g.ids)).toEqual([["up"], ["del"], ["old"]]);
    expect(groups[2]!.unread).toBe(false);
  });
});
