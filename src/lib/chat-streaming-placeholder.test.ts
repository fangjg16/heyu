import { describe, expect, it } from "vitest";
import {
  CHAT_STREAMING_PLACEHOLDER,
  contentForStreamingPersist,
  isChatStreamingPlaceholder,
  overlayInFlightAssistantMessages,
  reviveStreamingMessage,
} from "./chat-streaming-placeholder";

describe("chat streaming placeholder", () => {
  it("persists empty streaming replies as a placeholder", () => {
    expect(
      contentForStreamingPersist({ content: "", isStreaming: true }),
    ).toBe(CHAT_STREAMING_PLACEHOLDER);
    expect(
      contentForStreamingPersist({
        content: "半段",
        isStreaming: true,
      }),
    ).toBe("半段");
  });

  it("revives the placeholder into a generating bubble", () => {
    const revived = reviveStreamingMessage({
      role: "assistant",
      content: CHAT_STREAMING_PLACEHOLDER,
    });
    expect(revived.isStreaming).toBe(true);
    expect(revived.content).toBe("");
    expect(isChatStreamingPlaceholder(CHAT_STREAMING_PLACEHOLDER)).toBe(true);
  });

  it("does not revive a finished job placeholder", () => {
    const kept = reviveStreamingMessage({
      role: "assistant",
      content: CHAT_STREAMING_PLACEHOLDER,
      pendingJobId: "job-1",
    });
    expect(kept.isStreaming).toBeUndefined();
    expect(kept.content).toBe(CHAT_STREAMING_PLACEHOLDER);
  });
});

describe("overlayInFlightAssistantMessages", () => {
  it("keeps a cached streaming bubble when remote dropped it", () => {
    const cached = {
      c1: [
        {
          id: "assistant-1",
          role: "assistant" as const,
          content: "",
          time: "t",
          isStreaming: true,
        },
      ],
    };
    const merged = overlayInFlightAssistantMessages({ c1: [] }, cached);
    expect(merged.c1?.[0]?.isStreaming).toBe(true);
  });
});
