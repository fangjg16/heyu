import { describe, expect, it } from "vitest";
import {
  CHAT_EMPTY_ANSWER_RETRY,
  visibleAssistantAnswer,
} from "./chat-visible-answer";

describe("visibleAssistantAnswer", () => {
  it("keeps a normal done answer", () => {
    expect(
      visibleAssistantAnswer({ doneAnswer: "可以投，但要补医院数据。", streamed: "" }),
    ).toBe("可以投，但要补医院数据。");
  });

  it("uses streamed text when done answer is empty", () => {
    expect(
      visibleAssistantAnswer({ doneAnswer: "", streamed: "先看适应症和支付。" }),
    ).toBe("先看适应症和支付。");
  });

  it("does not leave an empty bubble when both are blank or think-only", () => {
    expect(visibleAssistantAnswer({ doneAnswer: "", streamed: "" })).toBe(
      CHAT_EMPTY_ANSWER_RETRY,
    );
    expect(
      visibleAssistantAnswer({
        doneAnswer: "<think>内部推理</think>",
        streamed: "",
      }),
    ).toBe(CHAT_EMPTY_ANSWER_RETRY);
  });
});
