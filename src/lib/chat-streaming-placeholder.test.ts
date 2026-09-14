import { describe, expect, it } from "vitest";
import {
  CHAT_STREAMING_PLACEHOLDER,
  CHAT_STREAM_STALE_MESSAGE,
  contentForStreamingPersist,
  isChatStreamingPlaceholder,
  overlayInFlightAssistantMessages,
  reviveStreamingMessage,
  settleStaleShortChatMessages,
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

  it("turns a short-chat placeholder into a retry message instead of spinning", () => {
    const revived = reviveStreamingMessage({
      role: "assistant",
      content: CHAT_STREAMING_PLACEHOLDER,
    });
    expect(revived.isStreaming).toBe(false);
    expect(revived.content).toBe(CHAT_STREAM_STALE_MESSAGE);
    expect(isChatStreamingPlaceholder(CHAT_STREAMING_PLACEHOLDER)).toBe(true);
  });

  it("settles a cached isStreaming short-chat bubble", () => {
    const settled = reviveStreamingMessage({
      role: "assistant",
      content: "",
      isStreaming: true,
      streamStatusLabel: "正在生成…",
    });
    expect(settled.isStreaming).toBe(false);
    expect(settled.content).toBe(CHAT_STREAM_STALE_MESSAGE);
    expect(settled.streamStatusLabel).toBeUndefined();
  });

  it("keeps partial short-chat text when settling", () => {
    const settled = reviveStreamingMessage({
      role: "assistant",
      content: "已经写出半段",
      isStreaming: true,
    });
    expect(settled.isStreaming).toBe(false);
    expect(settled.content).toBe("已经写出半段");
  });

  it("does not rewrite a finished job placeholder", () => {
    const kept = reviveStreamingMessage({
      role: "assistant",
      content: CHAT_STREAMING_PLACEHOLDER,
      pendingJobId: "job-1",
    });
    expect(kept.isStreaming).toBeUndefined();
    expect(kept.content).toBe(CHAT_STREAMING_PLACEHOLDER);
    expect(kept.pendingJobId).toBe("job-1");
  });

  it("skips the conversation that is still sending", () => {
    const input = {
      sending: [
        {
          id: "a1",
          role: "assistant" as const,
          content: "",
          time: "t",
          isStreaming: true,
        },
      ],
      other: [
        {
          id: "a2",
          role: "assistant" as const,
          content: CHAT_STREAMING_PLACEHOLDER,
          time: "t",
        },
      ],
    };
    const next = settleStaleShortChatMessages(input, "sending");
    expect(next.sending?.[0]?.isStreaming).toBe(true);
    expect(next.other?.[0]?.content).toBe(CHAT_STREAM_STALE_MESSAGE);
    expect(next.other?.[0]?.isStreaming).toBe(false);
  });
});

describe("overlayInFlightAssistantMessages", () => {
  it("does not resurrect a short-chat spinner from cache", () => {
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
    expect(merged.c1).toEqual([]);
  });

  it("keeps a cached pending job when remote dropped it", () => {
    const cached = {
      c1: [
        {
          id: "assistant-1",
          role: "assistant" as const,
          content: CHAT_STREAMING_PLACEHOLDER,
          time: "t",
          pendingJobId: "job-1",
        },
      ],
    };
    const merged = overlayInFlightAssistantMessages({ c1: [] }, cached);
    expect(merged.c1?.[0]?.pendingJobId).toBe("job-1");
  });
});
