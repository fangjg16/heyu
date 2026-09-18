import { describe, expect, it } from "vitest";
import {
  assembleScreeningChapterMarkdown,
  capitallensKnSources,
  ensureScreeningChapterFloor,
  isScreeningWorkpaperDump,
  resolveKnWorkstream,
  sliceDeliverableForKn,
} from "./capitallens-kn-map";
import { renderDeliverableChapterHtml } from "./kn-md-render";

const MEMO = `# 项目初筛备忘录

## 1. 项目概览

### 1.1 初筛结论

Promising。

## 2. 行业与竞争

行业正文。

## 3. 业务与技术

业务正文。

## 5. 财务分析

财务正文。
`;

const INDUSTRY = `# 行业尽调

## 2.1 行业概况

概况正文。

## 2.2 市场需求

需求正文。

## 额外观察

多出来的内容。
`;

const BUSINESS = `# 商业尽调

## 2. 真实业务与边界

业务正文。

## 4. 产品与技术

产品正文。

## 6. 运营、组织与关键依赖

组织正文。
`;

describe("capitallens kn map", () => {
  it("follows pipeline stage and does not upgrade screening when diligence files exist", () => {
    expect(
      resolveKnWorkstream({ pipelineStage: "due-diligence" }),
    ).toBe("diligence");
    expect(
      resolveKnWorkstream({ pipelineStage: "deal-screening" }),
    ).toBe("screening");
    expect(
      resolveKnWorkstream({ pipelineStage: "inbound" }),
    ).toBe("screening");
    expect(
      resolveKnWorkstream({ pipelineStage: "passed" }),
    ).toBe("screening");
  });

  it("does not put the screening memo into diligence industry, or the report into every chapter", () => {
    expect(
      capitallensKnSources("diligence", "industry-competition").map(
        (s) => s.fileId,
      ),
    ).toEqual(["industry-due-diligence"]);
    expect(
      capitallensKnSources("screening", "industry-competition").map(
        (s) => s.fileId,
      ),
    ).toEqual([
      "screening-memo",
      "enrichment",
      "enrichment",
      "enrichment",
      "enrichment",
      "enrichment",
    ]);
    expect(
      capitallensKnSources("diligence", "risk-return").map((s) => s.fileId),
    ).toEqual(["returns", "claim-audit", "risk-matrix"]);
    expect(
      capitallensKnSources("diligence", "project-summary").map((s) => s.fileId),
    ).toEqual(["investment-analysis-report", "brief", "theme"]);
  });

  it("keeps extra industry sections when the file is dedicated to that chapter", () => {
    const spec = capitallensKnSources("diligence", "industry-competition")[0]!;
    const sliced = sliceDeliverableForKn(INDUSTRY, spec);
    expect(sliced).toContain("概况正文");
    expect(sliced).toContain("需求正文");
    expect(sliced).toContain("多出来的内容");
  });

  it("slices the memo by numbered chapter and does not leak other chapters", () => {
    const spec = capitallensKnSources("screening", "industry-competition")[0]!;
    const sliced = sliceDeliverableForKn(MEMO, spec);
    expect(sliced).toContain("行业正文");
    expect(sliced).not.toContain("Promising");
    expect(sliced).not.toContain("财务正文");
  });

  it("only takes the org slice from business diligence into 公司与团队", () => {
    const spec = capitallensKnSources("diligence", "company-team").find(
      (s) => s.fileId === "business-due-diligence",
    )!;
    const sliced = sliceDeliverableForKn(BUSINESS, spec);
    expect(sliced).toContain("组织正文");
    expect(sliced).not.toContain("产品正文");
    expect(sliced).not.toContain("业务正文");
  });

  it("fills missing screening subsections and keeps 1.1 / 2.1 numbers", () => {
    const industry = ensureScreeningChapterFloor(
      "## 2. 行业与竞争\n\n行业正文。\n",
      "industry-competition",
    );
    expect(industry).toContain("行业正文");
    expect(industry).toContain("### 2.1 行业概况");
    expect(industry).toContain("### 2.5 发展趋势");
    const overview = ensureScreeningChapterFloor("", "project-summary");
    expect(overview).toContain("### 1.1 初筛结论");
    expect(overview).toContain("### 1.2 项目基本情况");
  });

  it("fills screening subsections from brief / theme / enrichment instead of dumping workpaper titles", () => {
    const html = renderDeliverableChapterHtml([
      {
        title: "行业与竞争",
        markdown: assembleScreeningChapterMarkdown("industry-competition", {
          enrichment: `# 公开补充要点

## Wave 1 — Market landscape and timing

短剧市场规模公开数字。

## Wave 2 — Competitive alternatives and position

客户仍在用人工编剧。

## Wave 3 — Customer and demand evidence

已有付费试点。

## Wave 4 — Distribution and market entry

依赖平台分发。
`,
        }),
        id: "screening-memo",
      },
    ]);
    expect(html).toContain("2.1 行业概况");
    expect(html).toContain("2.4 竞争结构");
    expect(html).toContain("短剧市场规模公开数字");
    expect(html).toContain("客户仍在用人工编剧");
    expect(html).not.toContain("公开补充要点");

    const overview = assembleScreeningChapterMarkdown("project-summary", {
      brief: "# 项目简报\n\n卖数字人克隆给品牌方。\n",
      theme: `**主分类**：传媒与内容 → MCN/达人经济与内容电商
**taxonomy_version**：2026-08-26-r2
`,
    });
    expect(overview).toContain("### 1.1 初筛结论");
    expect(overview).toContain("### 1.2 项目基本情况");
    expect(overview).toContain("卖数字人克隆给品牌方");
    expect(overview).toContain("传媒与内容");
    expect(overview).not.toMatch(/^#\s+赛道/m);

    const business = assembleScreeningChapterMarkdown("business-technology", {
      brief: "# 项目简报\n\n定价按条收费。\n",
    });
    expect(business).toContain("### 3.1 业务概览");
    expect(business).toContain("定价按条收费");
  });

  it("does not let theme or enrichment dumps stand in for a screening chapter", () => {
    const theme = `**主分类**：传媒与内容 → MCN/达人经济与内容电商
**匹配类型 / 置信度**：exact / 中
**taxonomy_version**：2026-08-26-r2
`;
    expect(isScreeningWorkpaperDump(theme)).toBe(true);
    const filled = ensureScreeningChapterFloor(theme, "industry-competition");
    expect(filled).toContain("### 2.1 行业概况");
    expect(filled).not.toContain("主分类");
    expect(
      isScreeningWorkpaperDump("# 公开补充要点\n\n- 市场规模\n"),
    ).toBe(true);
  });

  it("keeps company-team extras instead of dropping them for a standalone h1", () => {
    const html = renderDeliverableChapterHtml(
      [
        {
          title: "公司与团队",
          markdown: "# 公司与团队\n\n企查查股权。\n",
          id: "company-team-qcc",
        },
        {
          title: "项目简报",
          markdown: "# 项目简报\n\n主体信息。\n",
          id: "brief",
        },
      ],
      { keepSourceOrder: true, keepExtras: true },
    );
    expect(html).toContain("企查查股权");
    expect(html).toContain("主体信息");
  });
});
