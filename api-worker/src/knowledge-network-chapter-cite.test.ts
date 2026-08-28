import { describe, expect, it } from "vitest";
import {
  formatKnowledgeChapterCiteTag,
  parseCitedKnowledgeChapter,
} from "./knowledge-network-chapter-cite";

describe("parseCitedKnowledgeChapter", () => {
  it("reads id and label from the cite tag", () => {
    expect(
      parseCitedKnowledgeChapter(
        "请根据知识网络「项目快照」这一章回答：核心风险？\n\n【指定知识网络章节】snapshot:项目快照",
      ),
    ).toEqual({ sectionId: "snapshot", label: "项目快照" });
  });

  it("returns null without the marker", () => {
    expect(parseCitedKnowledgeChapter("随便问问")).toBeNull();
  });
});

describe("formatKnowledgeChapterCiteTag", () => {
  it("round-trips through parse", () => {
    const tag = formatKnowledgeChapterCiteTag("snapshot", "项目快照");
    expect(parseCitedKnowledgeChapter(tag)).toEqual({
      sectionId: "snapshot",
      label: "项目快照",
    });
  });
});
