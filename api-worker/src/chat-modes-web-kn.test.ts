import { describe, expect, it } from "vitest";
import {
  detectSkillIntent,
  KNOWLEDGE_NETWORK_USE_WEB_ANSWER,
  USER_QUICK_PROMPTS,
  websitePlatformIdentityLines,
} from "./chat-modes";

describe("knowledge network chat is web-only", () => {
  it("still detects delivery phrasing so the chat handler can redirect", () => {
    expect(detectSkillIntent("请生成项目知识网络")).toBe("knowledge_network");
  });

  it("points users to the project page instead of whole-page HTML", () => {
    expect(KNOWLEDGE_NETWORK_USE_WEB_ANSWER).toContain("网页生成");
    expect(KNOWLEDGE_NETWORK_USE_WEB_ANSWER).not.toContain("```html");
    expect(websitePlatformIdentityLines().join("\n")).not.toContain(
      "均在对话内完成",
    );
    expect(
      USER_QUICK_PROMPTS.some((p) => p.message.includes("生成项目知识网络")),
    ).toBe(false);
  });
});
