import { describe, expect, it } from "vitest";
import {
  formatKnowledgeChapterCiteTag,
  knowledgeNetworkChapterAskDraft,
} from "./knowledge-network-prompts";

describe("knowledgeNetworkChapterAskDraft", () => {
  it("prefills a chapter-scoped question stem", () => {
    expect(knowledgeNetworkChapterAskDraft("项目快照")).toBe(
      "请根据知识网络「项目快照」这一章回答：",
    );
  });
});

describe("formatKnowledgeChapterCiteTag", () => {
  it("encodes section id and label for the chat API", () => {
    expect(formatKnowledgeChapterCiteTag("snapshot", "项目快照")).toBe(
      "【指定知识网络章节】snapshot:项目快照",
    );
  });
});
