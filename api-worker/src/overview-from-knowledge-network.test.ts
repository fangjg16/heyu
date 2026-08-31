import { describe, expect, it } from "vitest";
import {
  buildKnowledgeNetworkSourceBlock,
  mergeChaptersPreferringDraft,
} from "./overview-from-knowledge-network";

describe("buildKnowledgeNetworkSourceBlock", () => {
  it("says there is no research when chapters are empty", () => {
    const { block, hasResearch } = buildKnowledgeNetworkSourceBlock({
      version: 0,
      chapters: [],
    });
    expect(hasResearch).toBe(false);
    expect(block).toContain("尚无研究章节");
  });

  it("includes published research chapters and keeps the overview layout instruction", () => {
    const { block, hasResearch } = buildKnowledgeNetworkSourceBlock({
      version: 20_100,
      chapters: [
        { sectionId: "project-summary", html: "<p>AI 剧本 SaaS</p>" },
        { sectionId: "industry-competition", html: "<p>影视剧本工具</p>" },
        { sectionId: "snapshot", html: "<p>旧快照仍应带上</p>" },
        { sectionId: "project-overview", html: "<p>不应出现在知识网络材料里</p>" },
      ],
    });
    expect(hasResearch).toBe(true);
    expect(block).toContain("v2.1");
    expect(block).toContain("项目概况");
    expect(block).toContain("AI 剧本 SaaS");
    expect(block).toContain("项目快照");
    expect(block).toContain("旧快照仍应带上");
    expect(block).toContain("不要扩写成研究长文");
    expect(block).not.toContain("不应出现在知识网络材料里");
    expect(block).toContain("当前知识网络正式版");
  });

  it("labels the source as this-round draft when fromDraft", () => {
    const { block } = buildKnowledgeNetworkSourceBlock({
      version: 20_100,
      fromDraft: true,
      chapters: [{ sectionId: "project-summary", html: "<p>草案概况</p>" }],
    });
    expect(block).toContain("本轮研究草案优先");
    expect(block).toContain("草案概况");
  });
});

describe("mergeChaptersPreferringDraft", () => {
  it("lets successful draft html override live, and keeps live when draft failed", () => {
    const merged = mergeChaptersPreferringDraft(
      [
        { sectionId: "project-summary", html: "<p>正式概况</p>" },
        { sectionId: "industry-competition", html: "<p>正式行业</p>" },
      ],
      [
        { sectionId: "project-summary", status: "ok", html: "<p>草案概况</p>" },
        { sectionId: "industry-competition", status: "failed", html: "<p>失败稿</p>" },
        { sectionId: "company-team", status: "ok", html: "<p>草案团队</p>" },
        { sectionId: "business-technology", status: "ok", html: "  " },
      ],
    );
    expect(merged).toEqual([
      { sectionId: "project-summary", html: "<p>草案概况</p>" },
      { sectionId: "industry-competition", html: "<p>正式行业</p>" },
      { sectionId: "company-team", html: "<p>草案团队</p>" },
    ]);
  });
});
