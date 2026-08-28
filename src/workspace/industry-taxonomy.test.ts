import { describe, expect, it } from "vitest";
import taxonomyMd from "./taxonomy.md?raw";
import { parseTaxonomyMarkdown } from "./parse-taxonomy-markdown";
import {
  displayIndustryCategory,
  formatIndustryCategory,
  INDUSTRY_TAXONOMY,
  parseIndustryCategory,
} from "./industry-taxonomy";

describe("parseTaxonomyMarkdown", () => {
  it("loads 28 themes from taxonomy.md and skips 强制最近匹配 bullets", () => {
    const parsed = parseTaxonomyMarkdown(taxonomyMd);
    expect(parsed.version).toBe("2026-08-28-r1");
    expect(parsed.themes).toHaveLength(28);
    expect(parsed.themes[0]?.theme).toBe("地产与建筑/资管");
    expect(parsed.themes[0]?.sectors).toContain("住宅开发与城更");
    expect(parsed.themes[0]?.sectors).not.toContain(
      "住宅开发与城更（旧改/保障房/棚改/城中村）",
    );
    const logistics = parsed.themes.find((t) => t.theme === "物流与供应链");
    expect(logistics?.sectors).toContain("一般贸易、进出口与供应链服务");
    expect(logistics?.sectors).not.toContain("供应链管理与贸易服务");
    expect(parsed.themes[14]?.theme).toBe("软件与企业服务");
    expect(parsed.themes[27]?.theme).toBe(
      "航空航天、低空经济与前沿交叉科技",
    );
    expect(
      parsed.themes.some((t) =>
        t.sectors.some((s) => s.includes("必须按交付物")),
      ),
    ).toBe(false);
    expect(INDUSTRY_TAXONOMY).toHaveLength(28);
  });
});

describe("parseIndustryCategory", () => {
  it("keeps slash inside a first-level theme when there is no sector", () => {
    expect(parseIndustryCategory("地产与建筑/资管")).toEqual({
      theme: "地产与建筑/资管",
      sector: "",
      custom: false,
    });
  });

  it("splits on spaced slash and allows custom second-level values", () => {
    const parsed = parseIndustryCategory("软件与企业服务 / 自制赛道");
    expect(parsed.theme).toBe("软件与企业服务");
    expect(parsed.sector).toBe("自制赛道");
    expect(parsed.custom).toBe(true);
  });

  it("formats and displays known pairs", () => {
    const stored = formatIndustryCategory("消费与零售", "品牌消费");
    expect(stored).toBe("消费与零售 / 品牌消费");
    expect(displayIndustryCategory(stored)).toBe("消费与零售 - 品牌消费");
    expect(parseIndustryCategory(stored).custom).toBe(false);
  });

  it("remaps the retired 供应链管理与贸易服务 label", () => {
    const parsed = parseIndustryCategory(
      "物流与供应链 / 供应链管理与贸易服务",
    );
    expect(parsed.sector).toBe("一般贸易、进出口与供应链服务");
    expect(parsed.custom).toBe(false);
  });
});
