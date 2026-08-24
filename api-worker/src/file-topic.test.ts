import { describe, expect, it } from "vitest";
import { resolveFileTopic } from "./file-topic";

describe("resolveFileTopic", () => {
  it("merges unique parse types into a few diligence buckets", () => {
    const cases: Array<[string, string, string]> = [
      ["brief.md", "初创项目 intake 简报 (Phase 1 验证阶段)", "定位与进展"],
      ["trends-timing.md", "创业定位研究·趋势与时机工作底稿", "行业与市场"],
      ["brainstorm.md", "创业切口头脑风暴与方向收敛文档", "定位与进展"],
      ["PROGRESS.md", "创业验证项目进展追踪文档", "定位与进展"],
      ["intake.md", "定位工作单 (Positioning Intake)", "定位与进展"],
      [
        "pricing-landscape.md",
        "海外AI剧本与叙事软件竞品定价全景分析",
        "对标与竞品",
      ],
      ["pricing-landscape.md", "竞品定价研究报告", "对标与竞品"],
      ["jucloud-vs-narrativeforge.md", "竞品对比与尽调分析报告", "对标与竞品"],
      ["sudowrite.md", "竞品对标卡片", "对标与竞品"],
    ];
    for (const [filename, documentType, label] of cases) {
      expect(
        resolveFileTopic({ filename, documentType }).label,
        `${filename} / ${documentType}`,
      ).toBe(label);
    }
  });
});
