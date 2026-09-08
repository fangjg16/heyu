import { describe, expect, it } from "vitest";
import {
  CHAT_EMPTY_ANSWER_RETRY,
  finalizeChatStreamAnswer,
} from "./chat-stream";

describe("finalizeChatStreamAnswer", () => {
  it("keeps generated text", () => {
    expect(finalizeChatStreamAnswer("  先看适应症。  ")).toBe("先看适应症。");
  });

  it("never finishes a stream with an empty answer", () => {
    expect(finalizeChatStreamAnswer("")).toBe(CHAT_EMPTY_ANSWER_RETRY);
    expect(finalizeChatStreamAnswer("   ")).toBe(CHAT_EMPTY_ANSWER_RETRY);
  });
});
