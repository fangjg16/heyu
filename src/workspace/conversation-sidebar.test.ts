import { describe, expect, it } from "vitest";
import {
  conversationHydrateCount,
  conversationSidebarRows,
  isPlaceholderEmptyConversation,
  isTruncatedConversationList,
  mergeBootstrapConversationList,
  mergeBootstrapMessages,
  prependConversation,
  pruneEmptyLiveConversations,
  shouldPersistConversation,
  unusedPlaceholderConversations,
  type SidebarConversationMeta,
} from "./conversation-sidebar";

function meta(
  partial: Partial<SidebarConversationMeta> & Pick<SidebarConversationMeta, "id">,
): SidebarConversationMeta {
  return {
    projectId: "proj-stone",
    preview: "议题",
    updatedAt: "2026-08-27",
    ...partial,
  };
}

describe("pruneEmptyLiveConversations", () => {
  const persistedA = meta({
    id: "proj-stone-blank-u1-1",
    preview: "收购条款",
  });
  const persistedB = meta({
    id: "proj-stone-blank-u1-2",
    preview: "尽调问题",
  });
  const currentBlank = meta({
    id: "proj-stone-blank-u1-new",
    preview: "新对话",
    variant: "blank",
    updatedAt: "2026-08-27T12:00",
  });
  const leftoverBlank = meta({
    id: "proj-stone-main",
    preview: "新对话",
    variant: "blank",
  });
  const leftoverAsk = meta({
    id: "proj-stone-blank-u1-old",
    preview: "新对话",
    variant: "blank",
  });

  it("keeps persisted metas when this tab has not loaded their messages", () => {
    const rows = pruneEmptyLiveConversations(
      [currentBlank, persistedA, persistedB],
      { [currentBlank.id]: [] },
      currentBlank.id,
    );
    expect(rows.map((c) => c.id)).toEqual([
      currentBlank.id,
      persistedA.id,
      persistedB.id,
    ]);
  });

  it("still shows the current empty new conversation", () => {
    const rows = pruneEmptyLiveConversations(
      [currentBlank, persistedA],
      {},
      currentBlank.id,
    );
    expect(rows.some((c) => c.id === currentBlank.id)).toBe(true);
  });

  it("does not drop other same-project rows just because messages.length === 0", () => {
    const rows = conversationSidebarRows(
      [currentBlank, persistedA, persistedB],
      {},
      true,
      currentBlank.id,
    );
    expect(rows).toHaveLength(3);
  });

  it("hides leftover unused blanks after the user leaves without sending", () => {
    const familyBlank = meta({
      id: "proj-family-blank-u1-new",
      projectId: "proj-family",
      preview: "新对话",
      variant: "blank",
    });
    const rows = pruneEmptyLiveConversations(
      [familyBlank, leftoverBlank, leftoverAsk, persistedA],
      { [familyBlank.id]: [] },
      familyBlank.id,
    );
    expect(rows.map((c) => c.id)).toEqual([familyBlank.id, persistedA.id]);
  });

  it("keeps a named empty thread the user renamed", () => {
    const named = meta({
      id: "proj-stone-blank-u1-named",
      preview: "待写纪要",
      variant: "named",
    });
    expect(
      isPlaceholderEmptyConversation(named, {}),
    ).toBe(false);
    expect(
      pruneEmptyLiveConversations([named], {}, "other").map((c) => c.id),
    ).toEqual([named.id]);
  });
});

describe("unusedPlaceholderConversations", () => {
  it("does not drop the current blank, only abandoned ones", () => {
    const current = meta({
      id: "proj-a-blank-1",
      projectId: "proj-a",
      preview: "新对话",
      variant: "blank",
    });
    const leftover = meta({
      id: "proj-b-main",
      projectId: "proj-b",
      preview: "新对话",
      variant: "blank",
    });
    expect(
      unusedPlaceholderConversations([current, leftover], {}, current.id).map(
        (c) => c.id,
      ),
    ).toEqual([leftover.id]);
  });
});

describe("shouldPersistConversation", () => {
  it("does not persist an unused blank until the first message", () => {
    const blank = meta({
      id: "proj-a-blank-1",
      projectId: "proj-a",
      preview: "新对话",
      variant: "blank",
    });
    expect(shouldPersistConversation(blank, { [blank.id]: [] })).toBe(false);
    expect(
      shouldPersistConversation(blank, { [blank.id]: [{ id: "m1" }] }),
    ).toBe(true);
  });
});

describe("prependConversation", () => {
  it("functionally prepends and never replaces the full list", () => {
    const existing = [meta({ id: "a" }), meta({ id: "b" })];
    const created = meta({ id: "new", variant: "blank", preview: "新对话" });
    expect(prependConversation(existing, created).map((c) => c.id)).toEqual([
      "new",
      "a",
      "b",
    ]);
  });

  it("dedupes if the new id is already present", () => {
    const existing = [meta({ id: "new", preview: "old" }), meta({ id: "a" })];
    const created = meta({ id: "new", preview: "新对话", variant: "blank" });
    const next = prependConversation(existing, created);
    expect(next).toHaveLength(2);
    expect(next[0]?.preview).toBe("新对话");
  });
});

describe("mergeBootstrapConversationList", () => {
  it("keeps a local 追问 blank when remote hydrate arrives later", () => {
    const local = [
      meta({ id: "new", variant: "blank", preview: "新对话" }),
      meta({ id: "a" }),
    ];
    const incoming = [meta({ id: "a" }), meta({ id: "b" })];
    expect(mergeBootstrapConversationList(local, incoming).map((c) => c.id)).toEqual([
      "new",
      "a",
      "b",
    ]);
  });

  it("does not replace a hydrated list with an empty bootstrap payload", () => {
    const local = [meta({ id: "a" }), meta({ id: "b" })];
    expect(mergeBootstrapConversationList(local, [])).toEqual(local);
  });
});

describe("mergeBootstrapMessages", () => {
  it("does not wipe loaded messages with an empty bootstrap payload", () => {
    const local = { a: [{ id: "m1" }] };
    expect(mergeBootstrapMessages(local, {})).toEqual(local);
  });

  it("keeps local-only keys when incoming hydrates other threads", () => {
    const local = { new: [] as { id: string }[] };
    const incoming = { a: [{ id: "m1" }] };
    expect(mergeBootstrapMessages(local, incoming)).toEqual({
      new: [],
      a: [{ id: "m1" }],
    });
  });
});

describe("isTruncatedConversationList", () => {
  it("flags a sidebar that collapsed to the new blank after hydrate", () => {
    expect(isTruncatedConversationList(1, 8)).toBe(true);
    expect(
      isTruncatedConversationList(
        1,
        conversationHydrateCount(
          [{ id: "a" }, { id: "b" }, { id: "c" }],
          { a: [1], d: [1] },
        ),
      ),
    ).toBe(true);
  });

  it("allows equal or larger local lists and tiny hydrates", () => {
    expect(isTruncatedConversationList(8, 8)).toBe(false);
    expect(isTruncatedConversationList(9, 8)).toBe(false);
    expect(isTruncatedConversationList(1, 1)).toBe(false);
    expect(isTruncatedConversationList(0, 0)).toBe(false);
  });
});
