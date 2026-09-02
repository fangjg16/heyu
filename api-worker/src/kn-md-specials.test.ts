import { describe, expect, it } from "vitest";
import { markdownToKnHtml } from "./kn-md-render";
import {
  renderAudienceLead,
  renderBattleCardsLead,
  renderCoverageLead,
  renderCostStatsLead,
  renderExperimentScoreLead,
  renderJourneyLead,
  renderLeanCanvasLead,
  renderMarketStatsLead,
  renderMoscowStatsLead,
  renderMvpSplitLead,
  renderPositionSplitLead,
  renderResearchGateLead,
  renderRiskHeatmapLead,
  renderScoreHeroLead,
  renderTripwireLead,
  renderValuePropLead,
  renderWeekTimelineLead,
  renderUnitEconLead,
  renderProjectionLead,
  renderFeatureMatrixLead,
  renderPositionAxesLead,
  renderPriceBandLead,
  renderMarketRingsLead,
  renderTopRisksLead,
  renderNetworkDefLead,
  renderNetworkScaleLead,
  renderRoleStripLead,
  renderLoopLead,
  renderMoscowKanbanLead,
  renderJourneyMapLead,
} from "./kn-md-specials";

const LEAN = `# Lean Canvas

## 1. Problem

1. 月报对不上投资决策
2. 投研材料散落各处
3. 协作方来回确认拖进度

## 2. Customer Segments

- 独立家族办公室 CIO
- 投研团队 3–8 人

## 3. Unique Value Proposition

把访谈、资料包和知识网络收成可发布的投研底稿。

## 4. Solution

- 用户访谈锁会话
- 资料包分目录落盘
- 章节按规则呈现

## 5. Channels

熟人转介与成功费试点。

## 6. Revenue Streams

按项目订阅 + 成交抽成。

## 7. Cost Structure

模型调用、对象存储、实施顾问。

## 8. Key Metrics

付费试点数、访谈完成率、草案发布时间。

## 9. Unfair Advantage

已在真实家族办公室流程里跑通的访谈与知识网络。
`;

const BATTLES = `# Competitor landscape

| Name | Product | Key Strength | Key Weakness |
| --- | --- | --- | --- |
| Addepar | 报表与持仓 | 机构级报表深度 | 不是 AI 投研工作台 |
| Addepar2 | 数据聚合 | 数据覆盖面 | 协作与访谈缺位 |
`;

const SCORE = `# Startup Validation Scorecard

| Dimension | Score (1-10) | Rationale |
| --- | --- | --- |
| Problem severity | 8 | 月报对不上决策 |
| Market size | 6 | 可服务市场窄 |
| **Overall** | **6.0** | 有条件继续 |

**VERDICT: CONDITIONAL — 先把付费试点跑通。**
`;

const POSITION = `# Positioning

## Competitive Alternatives

| Alternative | What it costs |
| --- | --- |
| 继续堆月报 | 决策滞后 |
| 通用 ChatGPT | 无项目资料包 |

## Unique Attributes

- 访谈会话锁定
- 知识网络按章呈现
- 资料包分目录版本
`;

const JOURNEY = `# User journey

## Journey 1 — 家族负责人：从月报堆里找不到决策

情绪：烦。

## Journey 2 — 投研：材料齐了却发不出草案

情绪：卡。
`;

const WEEKS = `# 30-day plan

## Week 1 — Independent customer discovery

**Goal:** 完成 8 场访谈

## Week 2 — Paid pilot offer

**Goal:** 发出 3 份报价
`;

const MOSCOW = `# Feature prioritization

## Must Have

| Feature | Why |
| --- | --- |
| 访谈锁会话 | 不能串台 |
| 资料包落盘 | 章节有据 |

## Should Have

| Feature | Why |
| --- | --- |
| 对战卡 | 竞品一眼能打 |

## Could Have

| Feature | Why |
| --- | --- |
| 品牌板 | 早期先不做 |

## Won't Have

| Feature | Why |
| --- | --- |
| 投资人工作台 | early 无协作方 |
`;

const MARKET = `# Market analysis

| Scenario | Planning TAM | Source |
| --- | --- | --- |
| 高 | US$20m ARR | [Estimate] |
| 基准 | US$8.67m ARR | [Estimate] |

| Scenario | Planning SAM | Source |
| --- | --- | --- |
| 基准 | US$2.1m ARR | [Estimate] |

| Scenario | Planning SOM | Source |
| --- | --- | --- |
| 基准 | US$0.4m ARR | [Estimate] |
`;

describe("special leads from heyu-like drafts", () => {
  it("folds Lean Canvas nine sections into kn-canvas", () => {
    const html = renderLeanCanvasLead(LEAN);
    expect(html).toContain("kn-canvas");
    expect(html).toContain("问题");
    expect(html).toContain("价值主张");
    expect(html).toContain("月报对不上投资决策");
    expect(markdownToKnHtml(LEAN, "lean-canvas")).toContain("kn-canvas");
    expect(markdownToKnHtml(LEAN, "lean-canvas")).toContain("kn-doc-title");
  });

  it("turns competitor Name/Strength/Weakness into battle cards", () => {
    const html = renderBattleCardsLead(BATTLES);
    expect(html).toContain("kn-battles");
    expect(html).toContain("Addepar");
    expect(html).toContain("不是 AI 投研工作台");
  });

  it("turns scorecard Overall + VERDICT into kn-hero", () => {
    const html = renderScoreHeroLead(SCORE);
    expect(html).toContain("kn-hero");
    expect(html).toContain("6.0");
    expect(html).toContain("有条件继续");
  });

  it("splits Competitive Alternatives vs Unique Attributes", () => {
    const html = renderPositionSplitLead(POSITION);
    expect(html).toContain("kn-split");
    expect(html).toContain("替代方案");
    expect(html).toContain("我们独有");
    expect(html).toContain("访谈会话锁定");
  });

  it("maps Journey headings to kn-journey", () => {
    expect(renderJourneyLead(JOURNEY)).toContain("kn-journey");
    expect(renderJourneyLead(JOURNEY)).toContain("家族负责人");
  });

  it("maps Week headings to kn-timeline", () => {
    expect(renderWeekTimelineLead(WEEKS)).toContain("kn-timeline");
    expect(renderWeekTimelineLead(WEEKS)).toContain("完成 8 场访谈");
  });

  it("does not stack a week strip above the vertical week spine", () => {
    const html = markdownToKnHtml(WEEKS, "action-plan-30-days");
    expect(html).toContain("kn-week");
    expect(html).not.toContain("kn-timeline");
    expect(markdownToKnHtml(WEEKS)).not.toContain("kn-timeline");
  });

  it("counts MoSCoW tables into four stats", () => {
    const html = renderMoscowStatsLead(MOSCOW);
    expect(html).toContain("kn-stats--4");
    expect(html).toContain("必须");
    expect(html).toContain(">2<");
  });

  it("reads Planning TAM/SAM/SOM baseline rows", () => {
    const html = renderMarketStatsLead(MARKET);
    expect(html).toContain("kn-stats");
    expect(html).toContain("US$8.67m ARR");
    expect(html).toContain("US$2.1m ARR");
    expect(html).toContain("可获得");
  });

  it("lights the research gate on Yellow light", () => {
    const html = renderResearchGateLead(`# Research Gate

**Yellow light** — 先补访谈再扩范围。

## Recommendation

有条件继续，先验证付费意愿。
`);
    expect(html).toContain("kn-gate");
    expect(html).toContain('data-state="conditional"');
    expect(html).toMatch(/kn-gate__opt is-on" data-state="conditional"/);
  });

  it("turns If/then kill criteria into tripwires", () => {
    const html = renderTripwireLead(`# Kill criteria

1. If fewer than 3/10 interviews say they would pay — stop the paid path.
2. If 30-day pilot has zero paid commits → pivot to research-only.
`);
    expect(html).toContain("kn-tripwire");
    expect(html).toContain("fewer than 3/10");
    expect(html).toContain("stop the paid path");
  });

  it("plots likelihood × impact into a heatmap", () => {
    const html = renderRiskHeatmapLead(`# Risks

| Risk | Likelihood | Impact |
| --- | --- | --- |
| 付费意愿不足 | High | Critical |
| 模型成本失控 | Medium | Major |
| 访谈锁会话被绕过 | Low | Moderate |
`);
    expect(html).toContain("kn-heatmap");
    expect(html).toContain("kn-heat--crit");
    expect(html).toContain("付费意愿不足");
  });

  it("splits primary vs anti-persona", () => {
    const html = renderAudienceLead(`# Audience

## Primary persona

- 独立家族办公室 CIO
- 「月报对不上决策」

## Anti-persona

- 要买现成报表系统的运营岗
`);
    expect(html).toContain("服务谁");
    expect(html).toContain("不服务谁");
    expect(html).toContain("独立家族办公室 CIO");
    expect(html).not.toContain("kn-quote");
  });

  it("does not hoist a 「」 term to the top of the audience chapter", () => {
    const html = markdownToKnHtml(
      `# 目标客户分析

一、核心痛点人群

团队假设「相比手表手环的准确度」是用户痛点，但没有访谈。
`,
      "target-audience",
    );
    expect(html).not.toContain("kn-quote");
    expect(html.indexOf("目标客户分析")).toBeLessThan(
      html.indexOf("相比手表手环的准确度"),
    );
  });

  it("splits MVP must-have vs out of scope", () => {
    const html = renderMvpSplitLead(`# MVP

## Must-have features

- 访谈锁会话
- 资料包落盘

## Explicitly out of scope

- 投资人工作台
- 品牌站点
`);
    expect(html).toContain("首版做");
    expect(html).toContain("明确不做");
    expect(html).toContain("访谈锁会话");
    expect(html).toContain("投资人工作台");
  });

  it("covers high confidence vs unknowns", () => {
    const html = renderCoverageLead(`# Confidence

## Highest confidence findings

- 痛点真实存在

## Critical unknowns

- 愿付费人数
`);
    expect(html).toContain("kn-coverage");
    expect(html).toContain("已站稳");
    expect(html).toContain("仍在薄冰");
  });

  it("covers solid ground vs thin ice headings", () => {
    const html = renderCoverageLead(`# Confidence

## Solid ground

- 内部工作流已经存在

## Thin ice

- 0 次独立客户访谈
`);
    expect(html).toContain("已站稳");
    expect(html).toContain("仍在薄冰");
    expect(html).toContain("内部工作流已经存在");
  });

  it("cards jobs / pains / gains", () => {
    const html = renderValuePropLead(`# Value

## Jobs-to-be-done

- 把月报收成可发布底稿

## Pains

- 材料散落各处

## Gains

- 当天能出草案
`);
    expect(html).toContain("kn-scenarios");
    expect(html).toContain("要完成的事");
    expect(html).toContain("痛点");
    expect(html).toContain("收益");
  });

  it("reads runway and burn into cost stats", () => {
    const html = renderCostStatsLead(`# Costs

**Runway:** 9 个月
**月消耗:** US$12k
**收入:** 尚无
`);
    expect(html).toContain("kn-stats");
    expect(html).toContain("9 个月");
    expect(html).toContain("US$12k");
  });

  it("reads Chinese market sizes without TAM/SAM titles", () => {
    const html = renderMarketStatsLead(`# 市场分析

## 总市场

国内智能睡眠硬件约 80 亿元 [Estimate]。

## 可服务市场

中产助眠设备约 12 亿元 [Estimate]。

## 可获得份额

首两年约 0.4 亿元 [Assumption]。
`);
    expect(html).toContain("kn-stats");
    expect(html).toContain("80 亿");
    expect(html).toContain("12 亿");
    expect(html).toContain("0.4 亿");
    expect(
      markdownToKnHtml(
        `# 市场分析

## 总市场

约 80 亿元。

## 可服务市场

约 12 亿元。
`,
        "market-analysis",
      ),
    ).toContain("kn-stats");
  });

  it("counts Chinese MoSCoW headings", () => {
    const html = renderMoscowStatsLead(`# 功能规划

## 必须有

- 睡眠记录
- 助眠建议

## 应该有

- 家庭账号

## 可以有

- 社区

## 本次不做

- 医疗诊断
`);
    expect(html).toContain("必须");
    expect(html).toContain("不做");
    expect(html).toContain(">2<");
  });

  it("turns 名称/强项/弱项 competitor tables into battle cards", () => {
    const html = renderBattleCardsLead(`# 竞争格局

| 名称 | 强项 | 弱项 |
| --- | --- | --- |
| 华为睡眠 | 硬件渠道 | 没有家办协作 |
| 小米手环 | 价格带 | 不是空间方案 |
`);
    expect(html).toContain("kn-battles");
    expect(html).toContain("华为睡眠");
    expect(html).toContain("没有家办协作");
  });

  it("reads 维度/评分 scorecards", () => {
    const html = renderScoreHeroLead(`# 综合总评

| 维度 | 评分 | 理由 |
| --- | --- | --- |
| 问题严重度 | 7 | 失眠人群真实存在 |
| **综合** | **6.0** | 有条件继续 |

**总评：** 有条件继续，先补访谈。
`);
    expect(html).toContain("kn-hero");
    expect(html).toContain("6.0");
    expect(html).toContain("有条件继续");
  });

  it("reads CAC/LTV/定价 into unit-econ stats", () => {
    const html = renderUnitEconLead(`# 商业模式

**获客成本:** 800 元
**LTV:** 4800 元
**定价:** 1200 元/年
`);
    expect(html).toContain("kn-stats");
    expect(html).toContain("800 元");
    expect(html).toContain("4800 元");
    expect(html).toContain("1200 元/年");
    expect(markdownToKnHtml(`# 商业模式

**获客成本:** 800 元
**LTV:** 4800 元
`, "business-model")).toContain("获客成本");
  });

  it("reads three-year revenue into projection stats", () => {
    const html = renderProjectionLead(`# 三年预测

| 年份 | 收入 | 成本 |
| --- | --- | --- |
| 第一年 | 120 万 | 200 万 |
| 第二年 | 400 万 | 280 万 |
| 第三年 | 900 万 | 350 万 |
`);
    expect(html).toContain("kn-stats");
    expect(html).toContain("第一年");
    expect(html).toContain("120 万");
    expect(html).toContain("400 万");
    expect(markdownToKnHtml(`# 三年预测

| 年份 | 收入 |
| --- | --- |
| 第一年 | 120 万 |
| 第二年 | 400 万 |
`, "projections")).toContain("120 万");
  });

  it("maps 旅程 headings without an em dash", () => {
    const html = renderJourneyLead(`# 用户旅程

## 旅程 1 首次配网

发现设备。

## 旅程 2 每晚助眠

形成习惯。
`);
    expect(html).toContain("kn-journey");
    expect(html).toContain("首次配网");
  });

  it("paints all 10 capability rows and a radar, not a 2-axis plot", () => {
    const dims = [
      "硬件采集",
      "助眠建议",
      "家办协作",
      "权限审计",
      "来源引用",
      "访谈锁定",
      "知识网络",
      "报告导出",
      "多主体权限",
      "人工批准",
    ];
    const rows = dims
      .map((d, i) => `| ${d} | ${i % 2 ? "强" : "够"} | 弱 | 无 |`)
      .join("\n");
    const md = `# 竞争格局

| 能力 | 我们 | 华为睡眠 | 小米手环 |
| --- | --- | --- | --- |
${rows}
`;
    const html = renderFeatureMatrixLead(md);
    expect(html).toContain("kn-featmap");
    expect(html).toContain("人工批准");
    expect(html).toContain("kn-radar");
    expect(html).toContain("viewBox=\"0 0 400 400\"");
    expect(html).toContain("差异最大的五维");
    expect(html).not.toContain("kn-axes");
    const page = markdownToKnHtml(md, "competitor-landscape");
    expect(page).toContain("kn-featmap");
    expect(page).toContain("kn-radar");
    expect(page).not.toContain("kn-axes");
    for (const d of dims) expect(page).toContain(d);
  });

  it("puts capabilities on radar axes when competitors are rows", () => {
    const dims = [
      "邀请网络",
      "多家办共同评估",
      "AI尽调",
      "主张级证据",
      "分析更新",
      "权限审计",
      "来源引用",
      "访谈锁定",
    ];
    const header = `| Name | ${dims.join(" | ")} |`;
    const sep = `| --- | ${dims.map(() => "---").join(" | ")} |`;
    const row = (name: string, fill: string) =>
      `| ${name} | ${dims.map(() => fill).join(" | ")} |`;
    const html = renderFeatureMatrixLead(`# 竞争格局

${header}
${sep}
${row("本项目目标", "✅")}
${row("Reuben AI", "△")}
${row("FinBursa", "—")}
`);
    expect(html).toContain("kn-radar");
    expect(html).toContain("邀请网络");
    expect(html).toContain("本项目目标");
    expect(html).toContain("#C43C2C");
  });

  it("reads ✅ / △ / — competitor cells as a feature heatmap", () => {
    const dims = [
      "硬件采集",
      "助眠建议",
      "家办协作",
      "权限审计",
      "来源引用",
      "访谈锁定",
      "知识网络",
      "报告导出",
      "多主体权限",
      "人工批准",
    ];
    const rows = dims
      .map((d, i) => `| ${d} | ✅ | ${i % 2 ? "△" : "—"} | — |`)
      .join("\n");
    const html = renderFeatureMatrixLead(`# 竞争格局

| 能力 | 我们 | 友商甲 | 友商乙 |
| --- | --- | --- | --- |
${rows}
`);
    expect(html).toContain("kn-featmap");
    expect(html).toContain("kn-feat--strong");
    expect(html).toContain("kn-feat--ok");
    expect(html).toContain("kn-feat--none");
    expect(html).toContain("kn-radar");
  });

  it("plots competitors on a two-axis map", () => {
    const html = renderPositionAxesLead(`# 竞争格局

| 名称 | 功能完整度 | 价格 |
| --- | --- | --- |
| 华为睡眠 | 高 | 高 |
| 小米手环 | 中 | 低 |
| 我们 | 高 | 中 |
`);
    expect(html).toContain("kn-axes");
    expect(html).toContain("kn-axes__dot--us");
    expect(html).toContain("华为睡眠");
  });

  it("places prices on a band", () => {
    const html = renderPriceBandLead(`# 竞争格局

| 名称 | 价格 |
| --- | --- |
| 小米手环 | 199 |
| 我们 | 1200 |
| 华为睡眠 | 2600 |
`);
    expect(html).toContain("kn-pricelist");
    expect(html).toContain("小米手环");
    expect(html).toContain("1200");
    expect(html).toContain("价格对照");
  });

  it("keeps longer priceband names instead of clipping at 12", () => {
    const html = renderPriceBandLead(`# 竞争格局

| 名称 | 价格 |
| --- | --- |
| FAAST / Hatton | 18000 |
| 我们 | 12000 |
`);
    expect(html).toContain("FAAST / Hatton");
    expect(html).not.toContain("Hat...");
  });

  it("draws nested market rings", () => {
    const html = renderMarketRingsLead(`# 市场分析

## 总市场
约 80 亿元。
## 可服务市场
约 12 亿元。
## 可获得份额
约 0.4 亿元。
`);
    expect(html).toContain("kn-rings");
    expect(html).toContain("kn-ring--tam");
    expect(html).toContain("80 亿");
  });

  it("counts experiment results", () => {
    const html = renderExperimentScoreLead(`# Playbook

| 实验 | 假设 | 结果 |
| --- | --- | --- |
| 访谈 | 愿付费 | 进行中 |
| 假门 | 点击 | 通过 |
`);
    expect(html).toContain("kn-score-sum");
    expect(html).toContain("通过 <b>1</b>");
    expect(html).toContain("进行中 <b>1</b>");
  });

  it("builds a lean canvas from ### 一、问题 Chinese slots", () => {
    const html = renderLeanCanvasLead(`# Lean Canvas

### 一、问题
入睡难。
### 二、客户细分
高压脑力上班族。
### 三、独特价值主张
无感干预。
### 四、解决方案
床头设备。
### 五、渠道
医院与家办。
### 六、收入来源
硬件销售。
### 七、成本结构
BOM 待补。
### 八、关键指标
留存。
### 九、不公平优势
复合背景。
`);
    expect(html).toContain("kn-canvas");
    expect(html).toContain("问题");
    expect(html).toContain("不公平优势");
  });

  it("reads 阶段 N journey headings", () => {
    const html = renderJourneyLead(`# 用户旅程

#### 阶段 1：发现与认知
看到报道。
#### 阶段 2：购买决策
问价格。
`);
    expect(html).toContain("kn-journey");
    expect(html).toContain("发现与认知");
  });

  it("reads 综合可靠度评分 when there is no dimension table", () => {
    const html = renderScoreHeroLead(`# 综合总评

**综合可靠度评分：4/10（Significant concerns）**

项目处于零验证状态。
`);
    expect(html).toContain("kn-hero");
    expect(html).toContain("4");
    expect(html).toContain("/10");
    expect(html).toContain("kn-hero--concern");
    expect(html).toContain("重大疑虑");
    expect(html).toContain("可靠度");
  });

  it("shows 待补 market stats instead of dropping the block", () => {
    const html = renderMarketStatsLead(`# 市场分析

| 层级 | 规模 | 来源 |
|------|------|------|
| 总市场 | 待补 | 无数据 |
| 可服务市场 | 待补 | 无数据 |
| 可获得份额 | 待补 | 无数据 |
`);
    expect(html).toContain("kn-stats");
    expect(html).toContain("待补");
    expect(html).toContain("kn-stat--pending");
  });

  it("turns numbered risks with 对策 into cards", () => {
    const html = renderTopRisksLead(`# 三大风险与对策

1. **外部行为不发生**

家办只收 PDF，对公定位就不成立。

**对策:** 先做 5 场独立访谈。

2. **成功费不成立**

三单不够覆盖人工。

**对策:** 连续三单先写进合同。
`);
    expect(html).toContain("kn-risks");
    expect(html).toContain("外部行为不发生");
    expect(html).toContain("对策");
    expect(html).toContain("5 场独立访谈");
  });

  it("splits network include vs not-a-gate", () => {
    const html = renderNetworkDefLead(`# 首阶段网络界定

## 首阶段纳入对象

- 老板和分析团队
- 熟人家办

## 不以以下条件限制

- 国家或注册地
- 是否购买订阅软件
`);
    expect(html).toContain("kn-split");
    expect(html).toContain("首阶段纳入");
    expect(html).toContain("不作为门槛");
    expect(html).toContain("老板和分析团队");
  });

  it("lays 5 → 10 → 25 out as a scale", () => {
    const html = renderNetworkScaleLead(`# 启动动作

| 阶段 | 关系来源 | 有效行为门槛 | 商业/运营门槛 |
| --- | --- | --- | --- |
| 5 家 | 老板熟人 | 不止浏览 | 三单书面成功费 |
| 10 家 | 转介 | 有人自己回来 | 至少一单回款 |
| 25 家 | 第二圈 | 反复协作 | 可比较成交率 |
`);
    expect(html).toContain("kn-pyramid");
    expect(html).toContain("活跃机构");
    expect(html).toContain("老板熟人");
    expect(html).not.toContain("kn-scale");
  });

  it("shows five roles as chips", () => {
    const html = renderRoleStripLead(`# 用户旅程

## 旅程范围

MVP 不是单一用户漏斗，而是五个角色围绕同一项目的协作循环。项目管理员负责正式状态；Core 贡献研究；Basic 消费报告；协作方补件；系统管理员改进分析。
`);
    expect(html).toContain("kn-roles");
    expect(html).toContain("项目管理员");
    expect(html).toContain("核心成员");
    expect(html).toContain("只读成员");
  });

  it("maps Step headings onto a vertical journey", () => {
    const html = renderJourneyLead(`# 启动动作

## Step 1 — 老板选择项目

真实材料。

## Step 2 — 内部完成可分享版本

事实和来源。

## Step 3 — 老板一对一邀请

口头邀请。

## Step 4 — 观察真实行为

有效行为。
`);
    expect(html).toContain("kn-journey--spine");
    expect(html).toContain("老板选择项目");
  });

  it("turns a five-step activation motion into a loop, not a second journey", () => {
    const md = `# 启动动作

## Step 1 — 老板选择项目

真实材料。

## Step 2 — 内部完成可分享版本

事实和来源。

## Step 3 — 老板一对一邀请

口头邀请。

## Step 4 — 观察真实行为

有效行为。

## Step 5 — 完结与费用回收

写回知识网络。
`;
    const html = renderLoopLead(md);
    expect(html).toContain("kn-loop");
    expect(html).toContain("知识网络");
    expect(html).toContain("观察真实行为");
    expect(html).toContain("kn-loop__st--focal");
    expect(renderJourneyLead(md)).toBe("");
    const page = markdownToKnHtml(md, "go-to-market");
    expect(page).toContain("kn-loop");
    expect(page).not.toContain("kn-journey");
  });

  it("lays MoSCoW into a kanban without arrows", () => {
    const html = renderMoscowKanbanLead(MOSCOW);
    expect(html).toContain("kn-kanban");
    expect(html).toContain("访谈锁会话");
    expect(html).toContain("投资人工作台");
    expect(html).toContain("2/4");
    expect(html).not.toContain("marker-end");
    expect(markdownToKnHtml(MOSCOW, "feature-prioritization")).toContain("kn-kanban");
    expect(markdownToKnHtml(MOSCOW, "feature-prioritization")).not.toContain("kn-stats--4");
  });

  it("draws a journey map only when stages have emotion", () => {
    const withFeel = `# 用户旅程

| 阶段 | 触点 / 情绪 | 流失风险 |
| --- | --- | --- |
| 发现 | 好奇 | 中 |
| 试用 | 卡 | 高 |
| 第一次有用 | 顺 | 低 |
| 续费 | 信任 | 低 |
`;
    const html = renderJourneyMapLead(withFeel);
    expect(html).toContain("kn-jmap");
    expect(html).toContain("用户感受");
    expect(html).toContain("kn-jmap__dot--pain");
    expect(
      markdownToKnHtml(
        `${withFeel}

#### 阶段 1：发现
#### 阶段 2：试用
#### 阶段 3：第一次有用
#### 阶段 4：续费
`,
        "user-journey",
      ),
    ).toContain("kn-jmap");
    expect(
      markdownToKnHtml(
        `${withFeel}

#### 阶段 1：发现
#### 阶段 2：试用
#### 阶段 3：第一次有用
#### 阶段 4：续费
`,
        "user-journey",
      ),
    ).not.toContain("kn-journey");
    expect(renderJourneyMapLead(`# 用户旅程

| 阶段 | 触点 / 情绪 | 流失风险 |
| --- | --- | --- |
| 发现 | 待补 | 待补 |
| 第一次有用 | 待补 | 待补 |
| 持续使用 | 待补 | 待补 |
`)).toBe("");
  });

  it("does not stack five roles onto one journey map", () => {
    const md = `# 用户旅程

## 旅程范围

MVP 不是单一用户漏斗，而是五个角色围绕同一项目的协作循环。项目管理员负责正式状态；Core 贡献研究；Basic 消费报告；协作方补件；系统管理员改进分析。

| 阶段 | 情绪 | 流失风险 |
| --- | --- | --- |
| 发现 | 烦 | 高 |
| 协作 | 卡 | 高 |
| 发布 | 顺 | 低 |
`;
    expect(renderJourneyMapLead(md)).toBe("");
    expect(renderJourneyLead(md)).toBe("");
    expect(renderRoleStripLead(md)).toContain("kn-roles");
  });
});
