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
    expect(markdownToKnHtml(LEAN, "lean-canvas")).toContain("<h2>");
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
    expect(html).toContain("CONDITIONAL");
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

  it("counts MoSCoW tables into four stats", () => {
    const html = renderMoscowStatsLead(MOSCOW);
    expect(html).toContain("kn-stats--4");
    expect(html).toContain("Must");
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
    expect(html).toContain("kn-quote");
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
    expect(html).toContain("已覆盖");
    expect(html).toContain("待澄清");
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
});
