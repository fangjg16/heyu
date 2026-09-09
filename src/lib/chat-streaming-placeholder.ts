import type { LiveChatMessage } from "@/workspace/chat-types";

/** 流式回复尚未落成正文时写入 D1 的占位，刷新后才能复活「生成中」。 */
export const CHAT_STREAMING_PLACEHOLDER = "正在生成，请稍候…";

export function isChatStreamingPlaceholder(content: string): boolean {
  const t = content.trim();
  return t === CHAT_STREAMING_PLACEHOLDER || t === "正在提交任务…";
}

export function contentForStreamingPersist(input: {
  content: string;
  isStreaming?: boolean;
  pendingJobId?: string;
}): string {
  if (input.pendingJobId) return input.content;
  if (input.isStreaming && !input.content.trim()) {
    return CHAT_STREAMING_PLACEHOLDER;
  }
  return input.content;
}

export function reviveStreamingMessage<T extends {
  role: string;
  content: string;
  pendingJobId?: string;
  isStreaming?: boolean;
  streamStatusLabel?: string;
}>(m: T): T {
  if (m.role !== "assistant" || m.pendingJobId) return m;
  if (m.isStreaming) return m;
  if (!isChatStreamingPlaceholder(m.content)) return m;
  return {
    ...m,
    content: "",
    isStreaming: true,
    streamStatusLabel: CHAT_STREAMING_PLACEHOLDER,
  };
}

export function reviveStreamingMessages(
  messagesByConversation: Record<string, LiveChatMessage[]>,
): Record<string, LiveChatMessage[]> {
  const out: Record<string, LiveChatMessage[]> = {};
  for (const [convId, msgs] of Object.entries(messagesByConversation)) {
    out[convId] = (msgs ?? []).map((m) => reviveStreamingMessage(m));
  }
  return out;
}
export function overlayInFlightAssistantMessages(
  remote: Record<string, LiveChatMessage[]>,
  cached?: Record<string, LiveChatMessage[]>,
): Record<string, LiveChatMessage[]> {
  if (!cached) return remote;
  const out: Record<string, LiveChatMessage[]> = { ...remote };
  for (const [convId, cachedMsgs] of Object.entries(cached)) {
    const inflight = (cachedMsgs ?? []).filter(
      (m) =>
        m.role === "assistant" &&
        (m.isStreaming || Boolean(m.pendingJobId)),
    );
    if (inflight.length === 0) continue;
    const next = [...(out[convId] ?? [])];
    for (const m of inflight) {
      const idx = next.findIndex(
        (x) =>
          x.id === m.id ||
          (m.pendingJobId && x.pendingJobId === m.pendingJobId),
      );
      if (idx < 0) {
        next.push(m);
        continue;
      }
      const cur = next[idx]!;
      const remoteDone = Boolean(cur.content.trim()) && !cur.isStreaming;
      if (remoteDone) continue;
      next[idx] = { ...cur, ...m };
    }
    out[convId] = next;
  }
  return out;
}
