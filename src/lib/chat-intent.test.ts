import { describe, expect, it } from "vitest";
import { isDeepSkillMessage, streamingAssistantDisplayText } from "./chat-intent";

describe("isDeepSkillMessage", () => {
  it("does not treat casual 创业搞头 questions as a deep job", () => {
    expect(
      isDeepSkillMessage("请帮我分析一下这个项目创业有没有搞头"),
    ).toBe(false);
  });

  it("still flags explicit intake / diligence phrasing", () => {
    expect(isDeepSkillMessage("帮我做个尽调")).toBe(true);
    expect(isDeepSkillMessage("请做一次深度分析")).toBe(true);
  });
});

describe("streamingAssistantDisplayText", () => {
  it("strips leftover think tags from the visible bubble", () => {
    expect(streamingAssistantDisplayText("</think>\n整理链接", false)).toBe(
      "整理链接",
    );
  });
});
