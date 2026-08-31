import { describe, expect, it } from "vitest";
import { sanitizeInterviewAssistantText } from "./interview-copy";

describe("sanitizeInterviewAssistantText", () => {
  it("strips backend interface leaks and keeps the questions", () => {
    const raw =
      "项目资料平台接口暂时不可用，我直接基于你给的四个方向提问。请一次性回答：1. 客户是谁？";
    expect(sanitizeInterviewAssistantText(raw)).toBe("请一次性回答：1. 客户是谁？");
  });

  it("strips interviewer stage directions", () => {
    const raw = "记下更正：缺口。\n请创始人答，或你转达后回答我：下一题";
    expect(sanitizeInterviewAssistantText(raw)).toBe("下一题");
  });

  it("strips the complete marker", () => {
    expect(
      sanitizeInterviewAssistantText(
        "材料够了，开始生成知识网络。\n<<<INTERVIEW_COMPLETE>>>",
      ),
    ).toBe("材料够了，开始生成知识网络。");
  });
});
