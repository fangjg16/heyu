import { describe, expect, it } from "vitest";
import {
  CHAT_EMPTY_ANSWER_RETRY,
  finalizeChatStreamAnswer,
  textFromLlmStreamPayload,
  transformOpenAiStreamToJfo,
} from "./chat-stream";

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

async function collectedDoneAnswer(
  upstream: ReadableStream<Uint8Array>,
): Promise<string> {
  let fromCb = "";
  const out = transformOpenAiStreamToJfo(
    upstream,
    {},
    (full) => {
      fromCb = full;
    },
    { emitMeta: false },
  );
  const reader = out.getReader();
  const dec = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
  }
  const hit = /event: done\ndata: (\{.*\})/u.exec(text);
  if (hit?.[1]) {
    return (JSON.parse(hit[1]) as { answer?: string }).answer ?? fromCb;
  }
  return fromCb;
}

describe("finalizeChatStreamAnswer", () => {
  it("keeps generated text", () => {
    expect(finalizeChatStreamAnswer("  先看适应症。  ")).toBe("先看适应症。");
  });

  it("never finishes a stream with an empty answer", () => {
    expect(finalizeChatStreamAnswer("")).toBe(CHAT_EMPTY_ANSWER_RETRY);
    expect(finalizeChatStreamAnswer("   ")).toBe(CHAT_EMPTY_ANSWER_RETRY);
  });
});

describe("textFromLlmStreamPayload", () => {
  it("reads OpenAI delta content", () => {
    expect(
      textFromLlmStreamPayload({
        choices: [{ delta: { content: "可以看适应症。" } }],
      }),
    ).toBe("可以看适应症。");
  });

  it("reads content arrays used by some gateways", () => {
    expect(
      textFromLlmStreamPayload({
        choices: [
          { delta: { content: [{ type: "text", text: "先看支付。" }] } },
        ],
      }),
    ).toBe("先看支付。");
  });

  it("reads Hermes-style top-level content", () => {
    expect(textFromLlmStreamPayload({ content: "先看医院数据。" })).toBe(
      "先看医院数据。",
    );
  });
});

describe("transformOpenAiStreamToJfo", () => {
  it("keeps the last SSE line even without a trailing newline", async () => {
    const answer = await collectedDoneAnswer(
      streamOf(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "正文在最后一行" } }] })}`,
      ),
    );
    expect(answer).toBe("正文在最后一行");
  });

  it("reads a whole JSON body that is not SSE", async () => {
    const answer = await collectedDoneAnswer(
      streamOf(
        JSON.stringify({
          choices: [{ message: { content: "整包 JSON 也有正文" } }],
        }),
      ),
    );
    expect(answer).toBe("整包 JSON 也有正文");
  });
});
