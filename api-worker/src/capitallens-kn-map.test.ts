import { describe, expect, it } from "vitest";
import {
  assembleScreeningChapterMarkdown,
  capitallensKnSources,
  ensureScreeningChapterFloor,
  isScreeningWorkpaperDump,
  liftInternalPendingTo72,
  pruneEmptyScreeningSubsections,
  relocateOrphanScreeningBlocks,
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
    expect(overview).not.toContain("### 1.1 初筛结论");
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

  it("uses the 企查查 company-team workpaper as the chapter body", () => {
    const md = assembleScreeningChapterMarkdown("company-team", {
      "company-team-qcc": `# 4. 公司与团队

## 4.1 公司基本信息

传媒由文化持有 55%。

## 4.2 团队与治理

李元是文化法定代表人。

## 4.3 背景调查与风险交叉分析

传媒出现欠税公告线索。
`,
    });
    expect(md).toContain("传媒由文化持有 55%");
    expect(md).toContain("## 4.1 公司基本信息");
    expect(md).not.toContain("4.4 核查线索");
  });

  it("drops empty floor headings like 5.4 after assembly", () => {
    const pruned = pruneEmptyScreeningSubsections(`## 5. 财务分析

### 5.1 数据口径

只有预测。

### 5.4 分析局限
`);
    expect(pruned).toContain("### 5.1 数据口径");
    expect(pruned).toContain("只有预测");
    expect(pruned).not.toContain("5.4");
  });

  it("moves leftover Agent建议 into 6.3 instead of leaving 6.3 empty", () => {
    const moved = relocateOrphanScreeningBlocks(`## 6. 风险与回报

### 6.1 回报来源

转让收益。

### 6.2 风险信号

欠税线索。

## Agent建议

Suggested next step：先补合同。

### 6.3 推进条件
`);
    expect(moved).toContain("### 6.3 推进条件");
    expect(moved).toContain("先补合同");
    expect(moved).not.toMatch(/^## Agent建议/m);

    const assembled = assembleScreeningChapterMarkdown("risk-return", {
      "screening-memo": `## 6. 风险与回报

### 6.1 回报来源

转让收益。

## Agent建议

先补关键事实。
`,
    });
    expect(assembled).toContain("### 6.3 推进条件");
    expect(assembled).toContain("先补关键事实");
    expect(assembled).not.toMatch(/^## Agent建议/m);
  });

  it("fills 5.4 and 6.3 from existing memo/brief text without a dedicated heading", () => {
    const finance = assembleScreeningChapterMarkdown("financial-diligence", {
      brief: `# 项目简报

## 交易与已核披露

SRC-032披露投前8500万元、本轮1500万元增资；为报价事实，非价值或资金到账核验。拟投法人尚未明确。

## 待核关键事实

新版MCN三年收入6000万元与核心表1600万元尚未桥接，不能相加。
`,
      "screening-memo": `## 5. 财务分析

### 5.1 数据口径

只有预测。

### 发现、证据及缺口

红果渠道结算未闭合，影响现在能否把收入当已发生。
`,
    });
    expect(finance).toContain("### 5.4 分析局限");
    expect(finance).toContain("非价值或资金到账核验");
    expect(finance).toContain("尚未桥接，不能相加");
    expect(finance).toContain("红果渠道结算未闭合");

    const risk = assembleScreeningChapterMarkdown("risk-return", {
      "screening-memo": `## 6. 风险与回报

### 6.1 回报来源

转让收益。拟投法人尚未明确。

### 6.2 风险信号

平台依赖高。

- 下一步：仅补充底线材料后更快。

## Agent建议

Suggested next step：先补关键事实。
若 Pass，拒绝理由：无合同。
`,
    });
    expect(risk).toContain("### 6.3 推进条件");
    expect(risk).toContain("先补关键事实");
    expect(risk).toContain("仅补充底线材料后更快");
    expect(risk.split(/### 6\.2/)[1]?.split(/### 6\.3/)[0]).not.toContain(
      "仅补充底线材料后更快",
    );
  });

  it("lifts 内部待确认 items from 7.1 into 7.2 and prunes 7.2 when none exist", () => {
    const split = liftInternalPendingTo72(`## 7. 待解决问题

### 7.1 对方待答

| 编号 | 类型 | 需要对方回答的问题 |
|---|---|---|
| Q-01 | 不清楚 | 融资主体是哪家公司 |
| Q-02 | 内部待确认 | 欠税公告是否仍有效 |
| I-01 | 内部核验 | 实缴与年报能否勾稽 |

- 请对方提供最新股东名册
- 内部待确认：数字克隆资产登记在哪家公司

### 7.2 内部待办
`);
    expect(split).toContain("### 7.2");
    expect(split).toContain("欠税公告是否仍有效");
    expect(split).toContain("实缴与年报能否勾稽");
    expect(split).toContain("数字克隆资产登记在哪家公司");
    expect(split).toContain("融资主体是哪家公司");
    const gaps = split.split(/### 7\.2/)[1] ?? "";
    expect(gaps).not.toContain("融资主体是哪家公司");
    expect(split.split(/### 7\.1/)[1]?.split(/### 7\.2/)[0]).not.toContain(
      "欠税公告是否仍有效",
    );

    const assembled = assembleScreeningChapterMarkdown("diligence-gaps", {
      "screening-memo": `## 7. 待解决问题

### 7.1 对方待答

| 编号 | 类型 | 需要对方回答的问题 |
|---|---|---|
| Q-01 | 不清楚 | 谁在付钱 |
`,
    });
    expect(assembled).toContain("谁在付钱");
    expect(assembled).not.toContain("7.2");
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
