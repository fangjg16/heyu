import { beforeEach, describe, expect, it } from "vitest";
import {
  assignAskConversationId,
  chatAskAboutFilePath,
  clearPendingAskSourceFile,
  parseChatAskSearch,
  pendingAskFileFromLocation,
  peekPendingAskSourceFile,
  resetChatAskStorageForTests,
  resolveAskNonce,
  storePendingAskSourceFile,
  withAskSourceQuery,
} from "./chat-ask-source";

describe("parseChatAskSearch", () => {
  it("reads new chat + source file from the query string", () => {
    expect(
      parseChatAskSearch(
        "?new=1&sourceFile=doc-1&sourceName=01_Bowen滨海区总体规划_2025-11.pdf&t=abc",
      ),
    ).toEqual({
      wantNew: true,
      sourceFile: "doc-1",
      sourceName: "01_Bowen滨海区总体规划_2025-11.pdf",
      nonce: "abc",
    });
  });

  it("treats a sourceFile alone as a request for a new chat", () => {
    expect(parseChatAskSearch("sourceFile=abc")).toEqual({
      wantNew: true,
      sourceFile: "abc",
      sourceName: null,
      nonce: null,
    });
  });

  it("is idle without ask params", () => {
    expect(parseChatAskSearch("")).toEqual({
      wantNew: false,
      sourceFile: null,
      sourceName: null,
      nonce: null,
    });
  });
});

describe("pendingAskFileFromLocation", () => {
  it("reads the source file from search or hash", () => {
    expect(
      pendingAskFileFromLocation(
        "?sourceFile=doc-1&sourceName=01_Bowen滨海区总体规划_2025-11.pdf",
      ),
    ).toEqual({
      id: "doc-1",
      filename: "01_Bowen滨海区总体规划_2025-11.pdf",
    });
    expect(
      pendingAskFileFromLocation("", "#sourceFile=doc-1&sourceName=a.pdf"),
    ).toEqual({ id: "doc-1", filename: "a.pdf" });
  });
});

describe("withAskSourceQuery", () => {
  it("keeps the file on the conversation path so the chip survives replace", () => {
    expect(
      withAskSourceQuery("/app/chat/proj/conv-1", {
        id: "doc-1",
        filename: "01_Bowen滨海区总体规划_2025-11.pdf",
      }),
    ).toContain("sourceFile=doc-1");
  });
});

describe("resolveAskNonce", () => {
  it("prefers the explicit t param", () => {
    expect(
      resolveAskNonce({
        wantNew: true,
        sourceFile: "doc-1",
        sourceName: "a.pdf",
        nonce: "click-9",
      }),
    ).toBe("click-9");
  });

  it("falls back to the file id when t is missing", () => {
    expect(
      resolveAskNonce({
        wantNew: true,
        sourceFile: "doc-1",
        sourceName: null,
        nonce: null,
      }),
    ).toBe("file:doc-1");
  });
});

describe("chatAskAboutFilePath", () => {
  it("builds a router path with encoded project and file name", () => {
    const path = chatAskAboutFilePath("proj-1", {
      id: "file-9",
      filename: "访谈.pdf",
    });
    expect(path.startsWith("/app/chat/proj-1?")).toBe(true);
    expect(path).toContain("new=1");
    expect(path).toContain("sourceFile=file-9");
    expect(path).toContain(encodeURIComponent("访谈.pdf"));
    const qs = new URLSearchParams(path.split("?")[1]);
    expect(qs.get("t")).toBeTruthy();
  });

  it("gives each click a distinct nonce so two tabs do not share a thread", () => {
    const a = chatAskAboutFilePath("proj-1", { id: "file-9", filename: "a.pdf" });
    const b = chatAskAboutFilePath("proj-1", { id: "file-9", filename: "a.pdf" });
    const ta = new URLSearchParams(a.split("?")[1]).get("t");
    const tb = new URLSearchParams(b.split("?")[1]).get("t");
    expect(ta).toBeTruthy();
    expect(tb).toBeTruthy();
    expect(ta).not.toBe(tb);
  });
});

describe("ask conversation session storage", () => {
  beforeEach(() => {
    resetChatAskStorageForTests();
  });

  it("reuses the same blank conversation for the same nonce", () => {
    const a = assignAskConversationId("proj", "u1", "n1");
    const b = assignAskConversationId("proj", "u1", "n1");
    expect(a).toBe(b);
    expect(a.startsWith("proj-blank-u1-")).toBe(true);
  });

  it("allocates a different conversation for a different nonce", () => {
    const a = assignAskConversationId("proj", "u1", "n1");
    const b = assignAskConversationId("proj", "u1", "n2");
    expect(a).not.toBe(b);
  });

  it("stores and peeks the pending source file by conversation", () => {
    storePendingAskSourceFile("conv-1", {
      id: "doc-1",
      filename: "01_Bowen滨海区总体规划_2025-11.pdf",
    });
    expect(peekPendingAskSourceFile("conv-1")).toEqual({
      id: "doc-1",
      filename: "01_Bowen滨海区总体规划_2025-11.pdf",
    });
    expect(peekPendingAskSourceFile("conv-2")).toBeNull();
    clearPendingAskSourceFile("conv-1");
    expect(peekPendingAskSourceFile("conv-1")).toBeNull();
  });
});
