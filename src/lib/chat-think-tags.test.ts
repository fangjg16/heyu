import { describe, expect, it } from "vitest";
import { stripAssistantThinkTags } from "./chat-think-tags";

describe("stripAssistantThinkTags", () => {
  it("drops a complete think block", () => {
    expect(
      stripAssistantThinkTags("<think>内部推理</think>\n正文开始"),
    ).toBe("正文开始");
  });

  it("drops a leftover closing tag", () => {
    expect(stripAssistantThinkTags("</think>\n接下来整理链接")).toBe(
      "接下来整理链接",
    );
    expect(stripAssistantThinkTags("思考中</think>")).toBe("思考中");
  });

  it("hides an unclosed think block while streaming", () => {
    expect(
      stripAssistantThinkTags("前言\n<think>还在想", true),
    ).toBe("前言\n");
  });

  it("drops an unclosed think block after the stream ends", () => {
    expect(stripAssistantThinkTags("前言\n<think>还在想", false)).toBe(
      "前言\n",
    );
  });

  it("keeps normal replies unchanged", () => {
    expect(stripAssistantThinkTags("我来帮您整理文件。")).toBe(
      "我来帮您整理文件。",
    );
  });
});
