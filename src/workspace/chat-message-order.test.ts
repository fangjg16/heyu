import { describe, expect, it } from "vitest";
import {
  isBlankAssistantPlaceholder,
  sortMessagesChronologically,
} from "./chat-message-order";
import type { LiveChatMessage } from "./chat-types";

describe("isBlankAssistantPlaceholder", () => {
  it("flags empty assistant shells and keeps streaming / job bubbles", () => {
    expect(
      isBlankAssistantPlaceholder({
        id: "assistant-1",
        role: "assistant",
        content: "",
        time: "t",
      }),
    ).toBe(true);
    expect(
      isBlankAssistantPlaceholder({
        id: "assistant-2",
        role: "assistant",
        content: "",
        time: "t",
        isStreaming: true,
      }),
    ).toBe(false);
    expect(
      isBlankAssistantPlaceholder({
        id: "assistant-3",
        role: "assistant",
        content: "",
        time: "t",
        pendingJobId: "job-1",
      }),
    ).toBe(false);
  });

  it("drops blank assistant bubbles when sorting the thread", () => {
    const messages: LiveChatMessage[] = [
      { id: "user-1", role: "user", content: "hi", time: "1", sortIndex: 0 },
      {
        id: "assistant-empty",
        role: "assistant",
        content: "   ",
        time: "2",
        sortIndex: 1,
      },
      {
        id: "assistant-ok",
        role: "assistant",
        content: "答案",
        time: "3",
        sortIndex: 2,
      },
    ];
    expect(sortMessagesChronologically(messages).map((m) => m.id)).toEqual([
      "user-1",
      "assistant-ok",
    ]);
  });
});
