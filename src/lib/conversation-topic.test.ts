import { describe, expect, it } from "vitest";
import {
  deriveConversationTopicHeuristic,
  isWeakConversationTopic,
} from "./conversation-topic";

describe("isWeakConversationTopic", () => {
  it("rejects demonstratives and one-character leftovers", () => {
    expect(isWeakConversationTopic("这")).toBe(true);
    expect(isWeakConversationTopic("这个")).toBe(true);
    expect(isWeakConversationTopic("那个哈")).toBe(true);
    expect(isWeakConversationTopic("材料")).toBe(true);
  });

  it("keeps real topics", () => {
    expect(isWeakConversationTopic("全面分析")).toBe(false);
    expect(isWeakConversationTopic("尽调清单")).toBe(false);
  });
});

describe("deriveConversationTopicHeuristic", () => {
  it("does not title a thread as 这 after stripping 看看", () => {
    expect(deriveConversationTopicHeuristic("看看这")).toBe("项目咨询");
    expect(deriveConversationTopicHeuristic("帮我看看这")).toBe("项目咨询");
    expect(deriveConversationTopicHeuristic("这")).toBe("项目咨询");
  });

  it("uses a later sentence when the first is only a demonstrative", () => {
    expect(deriveConversationTopicHeuristic("看看这。材料发错了请重看")).toBe(
      "材料发错了请重看",
    );
  });

  it("still extracts 全面分析", () => {
    expect(deriveConversationTopicHeuristic("全面分析一下这个项目")).toBe(
      "全面分析",
    );
  });
});
