import { describe, expect, it } from "vitest";
import { buildKnowledgeNetworkSourceBlock } from "./overview-from-knowledge-network";

describe("buildKnowledgeNetworkSourceBlock", () => {
  it("says there is no research when chapters are empty", () => {
    const { block, hasResearch } = buildKnowledgeNetworkSourceBlock({
      version: 0,
      chapters: [],
    });
    expect(hasResearch).toBe(false);
    expect(block).toContain("尚无已发布研究章节");
  });

  it("includes published research chapters and keeps the overview layout instruction", () => {
    const { block, hasResearch } = buildKnowledgeNetworkSourceBlock({
      version: 20_100,
      chapters: [
        { sectionId: "snapshot", html: "<p>AI 剧本 SaaS</p>" },
        { sectionId: "industry", html: "<p>影视剧本工具</p>" },
        { sectionId: "project-overview", html: "<p>不应出现在知识网络材料里</p>" },
      ],
    });
    expect(hasResearch).toBe(true);
    expect(block).toContain("v2.1");
    expect(block).toContain("项目快照");
    expect(block).toContain("AI 剧本 SaaS");
    expect(block).toContain("不要扩写成研究长文");
    expect(block).not.toContain("不应出现在知识网络材料里");
  });
});
