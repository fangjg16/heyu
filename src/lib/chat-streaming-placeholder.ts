import type { LiveChatMessage } from "@/workspace/chat-types";

/** 流式回复尚未落成正文时写入 D1 的占位。短答不能 resume，hydrate 时改成失败文案。 */
export const CHAT_STREAMING_PLACEHOLDER = "正在生成，请稍候…";

/** 短答流中断或刷新后看到的说明，避免一直「思考中」。 */
export const CHAT_STREAM_STALE_MESSAGE = "刚才这轮没有生成完，请再发一次。";

export const CHAT_STREAM_TIMEOUT_MESSAGE = "生成超时，请再发一次。";

/** 短答 SSE / 上游无增量时的空闲超时。 */
export const CHAT_SHORT_STREAM_IDLE_MS = 90_000;

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

function keptShortChatContent(content: string): string {
  const t = content.trim();
  if (!t || isChatStreamingPlaceholder(t)) return CHAT_STREAM_STALE_MESSAGE;
  return content;
}

/** 无 pendingJobId 的短答占位不能复活成生成中；深度任务才可以继续等。 */
export function settleStaleShortChatMessage<
  T extends {
    role: string;
    content: string;
    pendingJobId?: string;
    isStreaming?: boolean;
    streamStatusLabel?: string;
  },
>(m: T): T {
  if (m.role !== "assistant" || m.pendingJobId) return m;
  const spinning =
    Boolean(m.isStreaming) || isChatStreamingPlaceholder(m.content);
  if (!spinning) return m;
  return {
    ...m,
    content: keptShortChatContent(m.content),
    isStreaming: false,
    streamStatusLabel: undefined,
  };
}

export function settleStaleShortChatMessages(
  messagesByConversation: Record<string, LiveChatMessage[]>,
  skipConversationId?: string | null,
): Record<string, LiveChatMessage[]> {
  let changed = false;
  const out: Record<string, LiveChatMessage[]> = {};
  for (const [convId, msgs] of Object.entries(messagesByConversation)) {
    if (skipConversationId && convId === skipConversationId) {
      out[convId] = msgs;
      continue;
    }
    const next = (msgs ?? []).map((m) => {
      const settled = settleStaleShortChatMessage(m);
      if (settled !== m) changed = true;
      return settled;
    });
    out[convId] = next;
  }
  return changed ? out : messagesByConversation;
}

/** @deprecated hydrate 时改为 settle，不再把短答占位标成 isStreaming。 */
export function reviveStreamingMessage<T extends {
  role: string;
  content: string;
  pendingJobId?: string;
  isStreaming?: boolean;
  streamStatusLabel?: string;
}>(m: T): T {
  return settleStaleShortChatMessage(m);
}

export function reviveStreamingMessages(
  messagesByConversation: Record<string, LiveChatMessage[]>,
): Record<string, LiveChatMessage[]> {
  return settleStaleShortChatMessages(messagesByConversation);
}

export function overlayInFlightAssistantMessages(
  remote: Record<string, LiveChatMessage[]>,
  cached?: Record<string, LiveChatMessage[]>,
): Record<string, LiveChatMessage[]> {
  if (!cached) return remote;
  const out: Record<string, LiveChatMessage[]> = { ...remote };
  for (const [convId, cachedMsgs] of Object.entries(cached)) {
    const inflight = (cachedMsgs ?? []).filter(
      (m) => m.role === "assistant" && Boolean(m.pendingJobId),
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
      const remoteDone = Boolean(cur.content.trim()) && !cur.pendingJobId;
      if (remoteDone) continue;
      next[idx] = { ...cur, ...m };
    }
    out[convId] = next;
  }
  return out;
}
