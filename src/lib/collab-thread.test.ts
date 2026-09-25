import { describe, expect, it } from "vitest";
import { collabPriorTurns, collabThreadLeaves } from "./collab-thread";
import type { CollabItem } from "@/lib/project-api";

function item(partial: Partial<CollabItem> & Pick<CollabItem, "id" | "title">): CollabItem {
  return {
    projectId: "p",
    body: "",
    replyMode: "both",
    priority: "P2",
    dueAt: null,
    investorNote: null,
    fileReqs: [],
    status: "submitted",
    publishedAt: "",
    replyText: null,
    replySavedAt: null,
    replySubmittedAt: null,
    replyBy: null,
    reviewNote: null,
    confirmedAt: null,
    updatedAt: "",
    ...partial,
  };
}

describe("collabPriorTurns", () => {
  it("walks parent links from the original question to the latest follow-up", () => {
    const root = item({
      id: "a",
      title: "原问题",
      body: "请确认版权边界",
      replyText: "平台不主张权利",
    });
    const follow = item({
      id: "b",
      title: "补充：登记是否构成权利",
      body: "请说明登记和确权的差别",
      status: "pending_reply",
      parentItemId: "a",
      replyText: null,
    });
    expect(collabPriorTurns(follow, [follow, root]).map((row) => row.id)).toEqual(["a"]);
  });

  it("keeps a second follow-up behind the first", () => {
    const root = item({ id: "a", title: "原问题", replyText: "第一次答复" });
    const mid = item({
      id: "b",
      title: "第一轮补充",
      parentItemId: "a",
      replyText: "第二次答复",
      status: "submitted",
    });
    const next = item({
      id: "c",
      title: "第二轮补充",
      parentItemId: "b",
      status: "pending_reply",
    });
    expect(collabPriorTurns(next, [next, mid, root]).map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("matches follow-ups saved before the parent link existed", () => {
    const root = item({
      id: "a",
      title: "原问题",
      replyText: "已答复",
    });
    const follow = item({
      id: "b",
      title: "新标题",
      status: "pending_reply",
      sourceQuestionText: "补充问询｜原问题\n原答复：已答复",
    });
    expect(collabPriorTurns(follow, [follow, root]).map((row) => row.id)).toEqual(["a"]);
  });

  it("keeps only the latest card once a follow-up is sent", () => {
    const root = item({ id: "a", title: "原问题", replyText: "已答复" });
    const follow = item({
      id: "b",
      title: "补充",
      status: "pending_reply",
      parentItemId: "a",
    });
    expect(collabThreadLeaves([root, follow]).map((row) => row.id)).toEqual(["b"]);
  });

  it("shows the original card again when the follow-up is withdrawn to draft", () => {
    const root = item({ id: "a", title: "原问题", replyText: "已答复" });
    const follow = item({
      id: "b",
      title: "补充",
      status: "draft",
      parentItemId: "a",
    });
    expect(collabThreadLeaves([root, follow]).map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
