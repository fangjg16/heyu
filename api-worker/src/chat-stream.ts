import { CHAT_STATUS } from "./chat-context";
import type { LlmMessage } from "./llm-client";

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** 流结束时必须有可展示正文；空流不能把空 answer 丢给前端。 */
export const CHAT_EMPTY_ANSWER_RETRY = "这次没有生成出来，请再问一次。";

export function finalizeChatStreamAnswer(full: string): string {
  const text = (full ?? "").trim();
  return text || CHAT_EMPTY_ANSWER_RETRY;
}

function textFromContentField(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const row = part as Record<string, unknown>;
          if (typeof row.text === "string") return row.text;
          if (typeof row.content === "string") return row.content;
        }
        return "";
      })
      .join("");
  }
  return "";
}

/** 上游流可能是 OpenAI delta、content 数组，或 Hermes 直接给 content/text。 */
export function textFromLlmStreamPayload(json: Record<string, unknown>): string {
  const choice = Array.isArray(json.choices)
    ? (json.choices[0] as Record<string, unknown> | undefined)
    : undefined;
  const delta = (choice?.delta ?? json.delta) as Record<string, unknown> | undefined;
  const message = (choice?.message ?? json.message) as
    | Record<string, unknown>
    | undefined;
  return (
    textFromContentField(delta?.content) ||
    textFromContentField(delta?.reasoning_content) ||
    textFromContentField(message?.content) ||
    textFromContentField(message?.reasoning_content) ||
    textFromContentField(json.content) ||
    textFromContentField(json.text) ||
    textFromContentField(json.output) ||
    ""
  );
}

export function llmStreamBlockedMessage(
  json: Record<string, unknown>,
): string | null {
  const reason = Array.isArray(json.choices)
    ? (json.choices[0] as { finish_reason?: string } | undefined)?.finish_reason
    : undefined;
  if (reason === "content_filter") {
    return "这次没法按这个问题生成，请换个问法再试。";
  }
  const err = json.error;
  if (err) return CHAT_EMPTY_ANSWER_RETRY;
  return null;
}

/** 防止长时间检索/生成无字节导致浏览器或代理判定连接空闲而断开 */
function scheduleSseKeepalive(
  controller: ReadableStreamDefaultController<Uint8Array>,
  intervalMs = 12_000,
): () => void {
  const enc = new TextEncoder();
  const ping = () => {
    try {
      controller.enqueue(enc.encode(": keepalive\n\n"));
    } catch {
      /* stream already closed */
    }
  };
  const id = setInterval(ping, intervalMs);
  return () => clearInterval(id);
}

export function jfoSseError(message: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(sseLine("error", { message })));
      controller.close();
    },
  });
}

/** 将 OpenAI 兼容 SSE 转为平台事件：meta / delta / done */
export function transformOpenAiStreamToJfo(
  upstream: ReadableStream<Uint8Array>,
  meta: Record<string, unknown>,
  onDone?: (fullAnswer: string) => void,
  options?: { emitMeta?: boolean },
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buffer = "";
  let full = "";
  const emitMeta = options?.emitMeta !== false;

  return new ReadableStream({
    async start(controller) {
      if (emitMeta) {
        controller.enqueue(enc.encode(sseLine("meta", meta)));
      }
      const reader = upstream.getReader();
      let rawAll = "";
      let sawDataLine = false;
      let blocked: string | null = null;
      const ingestJson = (json: Record<string, unknown>) => {
        blocked = blocked || llmStreamBlockedMessage(json);
        const piece = textFromLlmStreamPayload(json);
        if (piece) {
          full += piece;
          controller.enqueue(enc.encode(sseLine("delta", { text: piece })));
        }
      };
      const ingestLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) return;
        if (trimmed.startsWith("data:")) {
          sawDataLine = true;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") return;
          try {
            ingestJson(JSON.parse(payload) as Record<string, unknown>);
          } catch {
            /* 单行不是 JSON 就跳过 */
          }
          return;
        }
        if (trimmed.startsWith("{")) {
          try {
            ingestJson(JSON.parse(trimmed) as Record<string, unknown>);
          } catch {
            /* 半截 JSON，留给整包回退 */
          }
        }
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (value) {
            const chunk = dec.decode(value, { stream: !done });
            rawAll += chunk;
            buffer += chunk;
          }
          if (done) {
            if (!value) {
              const tail = dec.decode();
              rawAll += tail;
              buffer += tail;
            }
            if (buffer.trim()) ingestLine(buffer);
            buffer = "";
            break;
          }
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";
          for (const line of parts) ingestLine(line);
        }
        if (!full.trim() && rawAll.trim() && !sawDataLine) {
          try {
            ingestJson(JSON.parse(rawAll) as Record<string, unknown>);
          } catch {
            /* 不是整包 JSON */
          }
        }
        if (!full.trim() && blocked) {
          full = blocked;
        }
        const answer = finalizeChatStreamAnswer(full);
        onDone?.(answer);
        controller.enqueue(
          enc.encode(sseLine("done", { answer, knowledgeNetworkHtml: null })),
        );
        controller.close();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (full.trim().length > 0) {
          onDone?.(full);
          controller.enqueue(
            enc.encode(
              sseLine("done", {
                answer: full,
                knowledgeNetworkHtml: null,
                truncated: true,
                truncateReason: msg,
              }),
            ),
          );
          controller.close();
        } else {
          controller.enqueue(enc.encode(sseLine("error", { message: msg })));
          controller.close();
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export async function fetchChatCompletionsStream(
  url: string,
  apiKey: string,
  model: string,
  messages: LlmMessage[],
  label: string,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      enable_thinking: false,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    let err = `${label} HTTP ${res.status}`;
    try {
      const j = JSON.parse(t) as { error?: { message?: string } };
      err = j.error?.message || err;
    } catch {
      if (t) err = t.slice(0, 200);
    }
    throw new Error(err);
  }

  if (!res.body) throw new Error(`${label} 未返回流式 body`);
  return res.body;
}

export type ChatPipelinePrepareResult = {
  meta: Record<string, unknown>;
  upstream: ReadableStream<Uint8Array>;
  onDone?: (fullAnswer: string) => void;
};

/**
 * 先推送 status / meta，再 pipe LLM 流。
 * prepare 内可做并行检索；通过 onStatus 向前端汇报阶段。
 */
export function buildChatPipelineStream(
  prepare: (emitStatus: (label: string) => void) => Promise<ChatPipelinePrepareResult>,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const stopKeepalive = scheduleSseKeepalive(controller);
      const emitStatus = (label: string) => {
        controller.enqueue(enc.encode(sseLine("status", { label })));
      };
      try {
        emitStatus(CHAT_STATUS.loading);
        const { meta, upstream, onDone } = await prepare(emitStatus);
        controller.enqueue(enc.encode(sseLine("meta", meta)));
        const body = transformOpenAiStreamToJfo(upstream, meta, onDone, { emitMeta: false });
        const reader = body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(enc.encode(sseLine("error", { message: msg })));
        controller.close();
      } finally {
        stopKeepalive();
      }
    },
  });
}
