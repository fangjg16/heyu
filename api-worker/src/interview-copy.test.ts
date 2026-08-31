import { describe, expect, it } from "vitest";
import {
  countInterviewUserTurns,
  sanitizeInterviewAssistantText,
} from "./interview-copy";

describe("countInterviewUserTurns", () => {
  it("counts user sections in the transcript", () => {
    expect(countInterviewUserTurns("")).toBe(0);
    expect(
      countInterviewUserTurns("## 用户\n答1\n\n## 访谈官\n问\n\n## 用户\n答2"),
    ).toBe(2);
  });
});

describe("sanitizeInterviewAssistantText", () => {
  it("drops leaked platform status", () => {
    expect(
      sanitizeInterviewAssistantText(
        "项目资料平台接口暂时不可用，我直接基于你给的四个方向提问。1. 客户是谁？",
      ),
    ).toBe("1. 客户是谁？");
  });
});
