import assert from "node:assert/strict";
import {
  collapseFilesByFilename,
  filterConversationSessionFiles,
} from "../src/lib/conversation-session-files.ts";

const name = "数字克隆 SZKL.CN 商业计划书.pdf";
const collapsed = collapseFilesByFilename([
  {
    id: "new",
    filename: name,
    createdAt: "2026-09-09T13:41:00.000Z",
    chunkCount: 1,
  },
  {
    id: "mid",
    filename: name,
    createdAt: "2026-09-09T13:36:00.000Z",
    chunkCount: 18,
  },
  {
    id: "old",
    filename: name,
    createdAt: "2026-09-09T12:06:00.000Z",
    chunkCount: 17,
  },
]);

assert.equal(collapsed.length, 1);
assert.equal(collapsed[0]?.id, "mid");
assert.equal(collapsed[0]?.chunkCount, 18);
assert.equal(collapsed[0]?.createdAt, "2026-09-09T13:41:00.000Z");

const mixed = collapseFilesByFilename([
  {
    id: "a",
    filename: "a.pdf",
    createdAt: "2026-09-09T10:00:00.000Z",
    chunkCount: 2,
  },
  {
    id: "b",
    filename: "b.pdf",
    createdAt: "2026-09-09T11:00:00.000Z",
    chunkCount: 3,
  },
]);
assert.deepEqual(
  mixed.map((f) => f.id),
  ["b", "a"],
);

const session = filterConversationSessionFiles(
  [
    {
      id: "s",
      filename: name,
      createdAt: "2026-09-09T13:41:00.000Z",
      chunkCount: 1,
      scope: "session",
      conversationId: "conv-1",
    },
    {
      id: "p",
      filename: name,
      createdAt: "2026-09-09T13:41:00.000Z",
      chunkCount: 1,
      scope: "package",
      conversationId: null,
    },
  ],
  "conv-1",
);
assert.deepEqual(
  session.map((f) => f.id),
  ["s"],
);

console.log("collapse-files-by-filename: ok");
