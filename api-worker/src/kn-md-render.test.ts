import { describe, expect, it } from "vitest";
import {
  EMPTY_CHAPTER_HTML,
  markdownToKnHtml,
  renderDeliverableChapterHtml,
} from "./kn-md-render";

describe("markdownToKnHtml", () => {
  it("renders headings, tables, and flags as kn classes", () => {
    const html = markdownToKnHtml(`# 市场分析

市场规模存在。

| 切法 | 规模 | 来源 |
| --- | --- | --- |
| 国内 SaaS | 待补 | [A-1] |

## Flags

- 红旗：客户访谈不足
`);
    expect(html).toContain('class="kn-from-md"');
    expect(html).toContain("kn-doc-title");
    expect(html).toContain('class="kn-table-wrap"');
    expect(html).toContain("<th>切法</th>");
    expect(html).toContain("国内 SaaS");
    expect(html).toContain("kn-flag--red");
    expect(html).toContain("客户访谈不足");
  });

  it("turns scorecard metadata, verdict, and red/yellow flags into kn blocks", () => {
    const html = markdownToKnHtml(`# Startup Validation Scorecard

**Phase:** 8 — Validation
**Confidence:** Medium

## Verdict

**VERDICT: CONDITIONAL — 有条件继续。**

## Flags

**Red Flags:**

- 商业模式清晰度仅 4/10

**Yellow Flags:**

- 6/10 不是基本验证通过
`);
    expect(html).toContain("kn-dochead");
    expect(html).not.toContain("kn-dochead__byline");
    expect(html).not.toContain("把握中等");
    expect(html).not.toContain("kn-score-sum");
    expect(html).toContain("有条件继续");
    expect(html).toContain("kn-callout--verdict");
    expect(html).not.toContain("kn-callout__label");
    expect(html).not.toContain('class="kn-md-sec">判断');
    expect(html).toContain("kn-flag--red");
    expect(html).toContain("kn-flag--amber");
    expect(html).toContain("kn-flags-fold--red");
    expect(html).toContain("kn-flags-fold--amber");
    expect(html).toContain("红旗");
    expect(html).toContain("黄旗");
    expect(html).toContain("必须先看");
    expect(html).toContain("需要盯住");
    expect(html).toContain("<details");
    expect(html).toContain("商业模式清晰度");
  });

  it("marks [Data] tags", () => {
    const html = markdownToKnHtml("**[Data]** 官网可核验。");
    expect(html).toContain("kn-md-tag");
    expect(html).toContain("kn-md-tag--data");
    expect(html).toContain("kn-tagged--data");
    expect(html).toContain("资料");
    expect(html).not.toContain(">Data<");
  });

  it("does not keep invented [Research] folder tags in body copy", () => {
    const html = markdownToKnHtml(
      "本章依据项目资料 [Research] AI版权经纪公司.pdf、老板指示 20260615.pdf。",
    );
    expect(html).not.toContain("[Research]");
    expect(html).toContain("AI版权经纪公司.pdf");
  });

  it("turns block quotes into quiet quotes, not nested callout cards", () => {
    const html = markdownToKnHtml("> 判断：先验证付费意愿。");
    expect(html).toContain("blockquote");
    expect(html).toContain("kn-quote");
    expect(html).not.toContain("kn-callout");
    expect(html).toContain("先验证付费意愿");
  });

  it("returns 尚未开展 when empty", () => {
    expect(markdownToKnHtml("")).toBe(EMPTY_CHAPTER_HTML);
    expect(markdownToKnHtml("   ")).toBe(EMPTY_CHAPTER_HTML);
  });

  it("folds Sources into details", () => {
    const html = markdownToKnHtml(`# 市场分析

正文一段。

## Sources

- [A-1] 官网
`);
    expect(html).toContain("kn-md-sources");
    expect(html).toContain("<details");
    expect(html).toContain("官网");
  });

  it("wraps Critical/High cells as badges", () => {
    const html = markdownToKnHtml(`# 风险

| 编号 | 级别 | 情景 |
| --- | --- | --- |
| R-001 | Critical | 付费意愿 |
| R-002 | High | 成本 |
`);
    expect(html).toContain("kn-badge--crit");
    expect(html).toContain("kn-badge--high");
  });

  it("composes a cover instead of a metadata grid", () => {
    const html = markdownToKnHtml(`# 合域家族办公室 AI 项目投研与协作平台

**Phase:** Final Deliverable
**Project:** jfo-ai-investment-platform
**Status:** Startup Design Phase 0.5–8 completed; Customer Discovery and Brand deferred
**Date:** 2026-09-01
**Verdict:** CONDITIONAL — 6.0/10
**Confidence:** Medium for internal problem and product direction; Low for external demand and revenue

---

正文。
`);
    expect(html).toContain("kn-dochead");
    expect(html).toContain("kn-doc-title");
    expect(html).not.toContain("kn-dochead__byline");
    expect(html).not.toContain("终稿");
    expect(html).not.toContain("2026-09-01");
    expect(html).toContain("kn-hero");
    expect(html).toContain("kn-hero__den");
    expect(html).toContain("有条件继续");
    expect(html).toContain("6.0");
    expect(html).toContain("kn-dochead__lede");
    expect(html).toContain("用户访谈");
    expect(html).toContain("创业设计第");
    expect(html).toContain("品牌暂缓");
    expect(html).toContain("内部问题");
    expect(html).toContain("产品方向把握中等");
    expect(html).not.toContain("Startup Design Phase");
    expect(html).not.toContain("for internal");
    expect(html).not.toContain("jfo-ai-investment-platform");
    expect(html).not.toContain("kn-masthead");
    expect(html).not.toContain('kn-dochead__byline">阶段');
    expect(html).not.toContain("<hr");
    const head = html.match(/<header class="kn-dochead">[\s\S]*?<\/header>/u)?.[0];
    expect(head).toBeTruthy();
    expect(head).toContain("kn-doc-title");
    expect(head).toContain("kn-hero");
    expect(head!.indexOf("kn-doc-title")).toBeLessThan(head!.indexOf("kn-hero"));
  });

  it("does not hoist market sizing above the exec-summary title", () => {
    const html = markdownToKnHtml(
      `# 合域家族办公室 AI 项目投研与协作平台

**Verdict:** CONDITIONAL — 6.0/10

## 执行摘要

正文一段。

| 层级 | 规模 | 来源 |
| --- | --- | --- |
| 总市场 | 待补 | 无数据 |
| 可服务市场 | 待补 | 无数据 |
| 可获得份额 | 待补 | 无数据 |
`,
      "readme",
    );
    expect(html).toContain("kn-doc-title");
    expect(html).not.toContain("kn-stats");
    expect(html.indexOf("kn-doc-title")).toBeLessThan(html.indexOf("执行摘要"));
  });

  it("pairs strongest evidence with weakest links as a split", () => {
    const html = markdownToKnHtml(`# 记分卡

**Strongest evidence**

- 内部工作流已经存在
- 权限与审计有明确需求

**Weakest links**

- 0 次独立客户访谈
- A+ 产品范围过大
`);
    expect(html).toContain("kn-split");
    expect(html).toContain("kn-split__col--go");
    expect(html).toContain("kn-split__col--stop");
    expect(html).toContain("最强证据");
    expect(html).toContain("最弱环节");
    expect(html).toContain("内部工作流已经存在");
    expect(html).toContain("0 次独立客户访谈");
  });

  it("wraps numbered sections and keeps section confidence off the masthead", () => {
    const html = markdownToKnHtml(`# 竞争格局

**Phase:** 3 — Market Research Synthesis
**Project:** jfo-ai-investment-platform
**Date:** 2026-08-26
**Confidence:** Medium-Low

## 1. Competitive Overview

**Section confidence:** Medium for public product/pricing facts; Low for traction.

[Data]
**Category:** Affinity, Addepar, Canoe

[Opinion]
**总体威胁: High.** 公开产品面已挤。
`);
    expect(html).toContain("kn-dochead");
    expect(html).not.toContain("kn-dochead__byline");
    expect(html).not.toContain("jfo-ai-investment-platform");
    expect(html).toContain("kn-md-section");
    expect(html).toContain("kn-md-sec");
    expect(html).toContain("竞争全景");
    expect(html).not.toContain("kn-md-h__n");
    expect(html).not.toContain("kn-md-h__t");
    expect(html).toContain("kn-md-lede");
    expect(html).toMatch(/公开产品|public product/u);
    expect(html).not.toContain("本节把握");
    expect(html).not.toContain("kn-md-headrow");
    expect(html).not.toContain("kn-section-conf");
    expect(html).not.toContain('kn-masthead__k">本节把握');
    expect(html).toContain("kn-tagged--data");
    expect(html).toContain("kn-tagged--opinion");
    expect(html).toContain("Affinity");
    expect(html).toContain("总体威胁");
  });

  it("nests T1 under the numbered section instead of matching its heading weight", () => {
    const html = markdownToKnHtml(`# 行业趋势与时机

## 1. Executive View

**Section confidence:** Medium.

[Opinion]
窗口仍在。

### T1: 家办直接投资与 club deal 保持战略重要性

[Data]
PwC 2024。
`);
    const section = html.match(
      /<section class="kn-md-section">[\s\S]*?<\/section>/u,
    )?.[0];
    expect(section).toBeTruthy();
    expect(section).toContain("kn-md-sec");
    expect(section).toContain("总览");
    expect(section).toContain("kn-md-subblock");
    expect(section).toContain('class="kn-md-sub"');
    expect(section).toContain("kn-md-sub__k");
    expect(section).toContain("家办直接投资");
    expect(html.indexOf("kn-md-sec")).toBeLessThan(html.indexOf("kn-md-sub"));
  });

  it("renders #### and 3.1 headings instead of leaving hashes", () => {
    const html = markdownToKnHtml(`# 三、业务

#### 3.1 问题

高压脑力上班族过载。

#### 3.2 方案

床头被动监测。
`);
    expect(html).not.toContain("####");
    expect(html).toContain("3.1 问题");
    expect(html).toContain("3.2 方案");
    expect(html).toContain("kn-md-topic");
    expect(html).toContain("问题");
    expect(html).toContain("方案");
  });

  it("treats 一、 lines as headings", () => {
    const html = markdownToKnHtml(`# 目标客户分析

一、核心痛点人群

高压脑力上班族。
`);
    expect(html).toContain("kn-md-sec");
    expect(html).toContain("核心痛点人群");
    expect(html).toContain("高压脑力上班族");
    expect(html).not.toContain("一、");
  });

  it("treats hashed 一、 as a section, not a subblock", () => {
    const html = markdownToKnHtml(`# 目标客户分析

### 一、核心痛点人群

高压脑力上班族。

### 二、当前替代方案

穿戴设备。
`);
    expect(html).toContain('section class="kn-md-section"');
    expect(html).not.toContain("kn-md-subblock");
    expect(html).toContain("核心痛点人群");
  });

  it("localizes [Data，访谈] and Significant concerns", () => {
    const html = markdownToKnHtml(`# 综合总评

**综合可靠度评分：4/10（Significant concerns）**

痛点 [Data，访谈] 未量化。
`);
    expect(html).toContain("kn-md-tag--data");
    expect(html).toContain("资料 · 访谈");
    expect(html).toContain("重大疑虑");
    expect(html).not.toContain("Significant concerns");
  });

  it("renders a 2x2 positioning table as a quad", () => {
    const html = markdownToKnHtml(`# 定位

| | 被动监测 | 主动干预 |
|---|----------|----------|
| 有感 | 穿戴设备 | 软件 App |
| 无感 | 待补 | Somni |
`);
    expect(html).toContain("kn-quad");
    expect(html).toContain("被动监测");
    expect(html).toContain("Somni");
    expect(html).toContain("kn-pending");
  });

  it("turns a colon lead-in before a table into a kicker", () => {
    const html = markdownToKnHtml(`# 市场

团队将市场按场景分三层递进 [Data，团队叙事]：

| 层级 | 场景 |
|------|------|
| L2 | 卧室 |
`);
    expect(html).toContain("kn-md-kicker");
    expect(html).toContain("团队将市场按场景分三层递进");
  });

  it("reads Section confidence when the colon is inside the bold", () => {
    const html = markdownToKnHtml(`# 竞争格局

## 1. Competitive Overview

**Section confidence: Medium.**

公开产品面已挤。
`);
    expect(html).not.toContain("本节把握");
    expect(html).not.toContain("kn-section-conf");
    expect(html).not.toContain("<strong>Section confidence");
    expect(html).toContain("公开产品面已挤");
  });

  it("keeps 本节把握 / 总体把握 notes as quiet leads, without heading badges", () => {
    const html = markdownToKnHtml(`# 研究结论

**总体把握: Medium** 综合把握中等；外部需求和收入把握偏低。

## 1.总览

**本节把握: Medium.** “问题存在”的证据强于“本产品可商业化”的证据。
`);
    expect(html).toContain("kn-md-lede");
    expect(html).toContain("综合把握中等");
    expect(html).toContain("问题存在");
    expect(html).not.toContain("kn-section-conf");
    expect(html).not.toContain("kn-md-headrow");
    expect(html).not.toContain("本节把握");
    expect(html).not.toContain("总体把握");
    expect(html).not.toContain("<strong>本节把握");
    expect(html).not.toContain("<strong>总体把握");
  });

  it("does not wrap a long 依据 cell in a badge just because it mentions 把握偏低", () => {
    const html = markdownToKnHtml(`# 记分卡

| 维度 | 分数 | 依据 |
| --- | --- | --- |
| 市场规模 | 5 | [Estimate] [low confidence] 远期总市场约 US$2.4m，尚不足以支持大平台叙事。 |
| 创始人与市场匹配 | 7 | 团队有真实项目入口；能邀请至少 5 位参与验证。 |
`);
    expect(html).toContain("kn-basis");
    expect(html).toContain("kn-basis__tags");
    expect(html).toContain("<p>远期总市场");
    expect(html).toContain("kn-badge--low");
    expect(html).not.toMatch(/kn-badge--low">[^<]*远期总市场/u);
    expect(html).toContain("能邀请至少 5 位");
  });

  it("does not let Financial Model Stage hide the date on the cover", () => {
    const html = markdownToKnHtml(`# 财务测算

**Financial Model Stage:** A — Assumption-Based | All projections are hypothetical
**Validation status:** Customer interviews 0 conducted
**Phase:** 7 — Unit Economics and Projections
**Project:** jfo-ai-investment-platform
**Date:** 2026-09-01
**Currency:** USD
**Confidence:** Low

正文。
`);
    expect(html).toContain("kn-dochead");
    expect(html).not.toContain("2026-09-01");
    expect(html).toContain("USD");
    expect(html).not.toContain("把握偏低");
    expect(html).not.toContain("jfo-ai-investment-platform");
    expect(html).not.toContain("<strong>Financial Model Stage");
  });

  it("treats a mid-document Yellow Light heading as a gate, not a second cover", () => {
    const html = markdownToKnHtml(`# Research Gate

**Phase:** 0.5 — Research
**Date:** 2026-09-01

# 🟡 Yellow Light — Conditional Proceed

先补访谈再扩范围。
`);
    expect(html).toContain("kn-doc-title");
    expect((html.match(/kn-doc-title/g) ?? []).length).toBe(1);
    expect(html).toContain("kn-gate");
    expect(html).toContain("先补访谈再扩范围");
    expect(html).not.toContain("# 🟡");
    expect(html).not.toContain("Yellow Light");
    expect(html).not.toMatch(/<h2 class="kn-doc-title">[^<]*Yellow/u);
  });

  it("localizes GPT evidence tags with dashes and founder decisions", () => {
    const html = markdownToKnHtml(`# 市场

[Data — company-reported] 官网写着已上线。

[Founder decision] 先做投研工作台。

[Unknown] 愿付费人数。
`);
    expect(html).toContain("kn-tagged--data");
    expect(html).toContain("资料 · 厂商自报");
    expect(html).toContain("kn-tagged--opinion");
    expect(html).toContain("团队决定");
    expect(html).toContain("kn-tagged--gap");
    expect(html).toContain("未知");
    expect(html).not.toContain("company-reported");
    expect(html).not.toContain("Founder decision");
  });

  it("hides the README document index instead of listing internal paths", () => {
    const html = markdownToKnHtml(`# Startup Design README

正文一段。

## Document index

- [\`01-discovery/market-analysis.md\`](https://example.com/market-analysis.md)
- [\`02-strategy/lean-canvas.md\`](https://example.com/lean-canvas.md)
`);
    expect(html).toContain("正文一段");
    expect(html).not.toContain("market-analysis.md");
    expect(html).not.toContain("01-discovery");
    expect(html).not.toContain("Document index");
  });

  it("turns Mitigation into a kicker", () => {
    const html = markdownToKnHtml(`# 风险

付费意愿不足。

**Mitigation:** 先做 10 场独立访谈再扩范围。
`);
    expect(html).toContain("kn-md-kicker");
    expect(html).toContain("对策");
    expect(html).toContain("先做 10 场独立访谈");
    expect(html).not.toContain("<strong>Mitigation");
  });

  it("keeps Qwen item lines as a list instead of gluing them into a paragraph", () => {
    const html = markdownToKnHtml(`# 结论可靠度

### 继续追踪前必须验证的四项前提

干预效果是否有对照试验数据支撑——没有人体试验。 [资料]
用户感知的无感是否被独立样本验证——未做。 [资料]
传感器精度是否达到医疗级——厂商自报。 [资料]
`);
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
    expect(html).toContain("对照试验");
    expect(html).not.toContain("没有人体试验。 用户感知");
  });

  it("renders 评分：4/10（重大疑虑） as the same score block", () => {
    const html = markdownToKnHtml(`# 结论可靠度

## 总体判断

评分：4/10（重大疑虑）
`);
    expect(html).toContain("kn-hero");
    expect(html).toContain("kn-hero__den");
    expect(html).toContain("/10");
    expect(html).toContain("重大疑虑");
    expect(html).toContain("kn-hero--concern");
  });

  it("strips chapter-level 7. but keeps subsection 8.1", () => {
    const html = markdownToKnHtml(`# 行业尽调

## 7.价值链与利润池

链条正文。

## 8. 竞争结构与参与者

### 8.1 竞争格局判断

判断正文。
`);
    expect(html).toContain("价值链与利润池");
    expect(html).toContain("竞争结构与参与者");
    expect(html).toContain("8.1 竞争格局判断");
    expect(html).not.toContain(">7.");
    expect(html).not.toContain("kn-md-h__n");
  });

  it("strips 三、 from headings and keeps the title", () => {
    const html = markdownToKnHtml(`# 市场

### 三、行业与市场

切分按场景。
`);
    expect(html).toContain("行业与市场");
    expect(html).not.toContain("三、");
    expect(html).not.toContain("kn-md-h__n");
  });

  it("renders a flags table instead of leaking pipe separators", () => {
    const html = markdownToKnHtml(`# 综合总评

## Flags

| 序号 | 风险 | 说明 |
| --- | --- | --- |
| 1 | 零验证状态 | 产品尚未量产 [资料] |
| 2 | 缺少临床数据 | 没有对照试验 |
`);
    expect(html).toContain("kn-table-wrap");
    expect(html).toContain("零验证状态");
    expect(html).toContain("<th>");
    expect(html).not.toContain("|------|");
    expect(html).not.toContain("| 序号 |");
  });

  it("folds week headings into a vertical timeline", () => {
    const html = markdownToKnHtml(`# 四周计划

## 第1周 · 独立用户访谈

**Goal:** 完成 8 场访谈

## 第2周 · 整理证据

**Goal:** 把访谈收进资料包
`);
    expect(html).toContain("kn-week");
    expect(html).toContain("独立用户访谈");
    expect(html).toContain("目标");
    expect(html).toContain("open");
    expect((html.match(/<details class="kn-week"/g) ?? []).length).toBe(2);
  });

  it("lays week goals and named tasks on separate layers", () => {
    const html = markdownToKnHtml(`# 四周计划

## 第1周 · 独立用户访谈

**Goal:** 完成至少 5 次独立访谈

1. **老板 + Jessica:** 从名单里选出 8 个对象
2. **Jessica:** 完成 5–8 场访谈
3. **Jensen:** 独立编码痛点

**Don't do:** 不要展示界面。
`);
    expect(html).toContain("kn-plan--goal");
    expect(html).toContain("kn-plan--stop");
    expect(html).toContain("kn-task__who");
    expect(html).toContain("老板 + Jessica");
  });

  it("folds experiment headings onto the same vertical spine", () => {
    const html = markdownToKnHtml(`# 验证手册

## Experiment 1 — 独立访谈

做 8 场。

## Experiment 2 — 假门页面

看点击。
`);
    expect(html).toContain("kn-week");
    expect(html).toContain("独立访谈");
    expect(html).toContain("open");
    expect((html.match(/<details class="kn-week"/g) ?? []).length).toBe(2);
  });

  it("folds wide comparison tables and leaves narrow ones open", () => {
    const wide = markdownToKnHtml(`# 对照

| A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- |
| 1 | 2 | 3 | 4 | 5 | 6 |
| 7 | 8 | 9 | 10 | 11 | 12 |
| 13 | 14 | 15 | 16 | 17 | 18 |
`);
    expect(wide).toContain("kn-wide-table");
    expect(wide).toContain("对照表");
    expect(wide).toContain("3 行");
    const narrow = markdownToKnHtml(`# 市场

| 切法 | 规模 | 来源 |
| --- | --- | --- |
| 国内 SaaS | 待补 | [A-1] |
| 海外 | 待补 | [A-2] |
`);
    expect(narrow).not.toContain("kn-wide-table");
  });

  it("folds methodology notes instead of leaving them in the main flow", () => {
    const html = markdownToKnHtml(`# 分析

正文一段。

## Methodology

口径怎么算。
`);
    expect(html).toContain("kn-md-sources");
    expect(html).toContain("Methodology");
    expect(html).toContain("口径怎么算");
  });

  it("centers section titles and keeps Research as a quieter topic", () => {
    const html = markdownToKnHtml(`# 合域

## 执行摘要

一段话。

## 要点

### Research

- 市场还空着
`);
    expect(html).toContain("kn-md-sec");
    expect(html).toContain("执行摘要");
    expect(html).toContain("kn-md-topic");
    expect(html).toContain("研究");
    expect(html).not.toContain(">Research<");
  });

  it("renders risks as side-by-side cards and drops the raw numbered list", () => {
    const html = markdownToKnHtml(`# 合域

## 三大风险与对策

### 1. 外部行为不发生

家办只收 PDF，对公定位就不成立。

**对策:** 先做 5 场独立访谈。

### 2. 成功费不成立

三单不够覆盖人工。

**对策:** 连续三单先写进合同。
`);
    expect(html).toContain("kn-risk-pair");
    expect(html).toContain("kn-risk-card--risk");
    expect(html).toContain("kn-risk-card--fix");
    expect(html).toContain("外部行为不发生");
    expect(html).toContain("5 场独立访谈");
    expect(html).not.toContain("kn-md-h__t");
  });

  it("badges Medium-High and long confidence phrases", () => {
    const html = markdownToKnHtml(`# 可靠度摘要

| Area | Confidence | What is known |
| --- | --- | --- |
| 内部问题 | Medium-High | 痛点真实 |
| Legal/compliance | Medium that risk exists | 还没做尽调 |
| Market context | Low | 外部未访 |
`);
    expect(html).toContain("kn-badge--mid");
    expect(html).toContain("kn-badge--low");
    expect(html).toContain("把握中高");
    expect(html).toContain("中等（风险存在）");
    expect(html).toContain("法律合规");
    expect(html).toContain("市场环境");
  });

  it("drops English anti-pattern names instead of turning them into task chips", () => {
    const html = markdownToKnHtml(`# 合域

## Anti-patterns detected

1. **Boiling the ocean.** 先锁一个真实项目，不要一次铺完全部架构。
2. **Building in stealth.** 需要独立客户访谈。
`);
    expect(html).toContain("kn-pitfalls");
    expect(html).toContain("先锁一个真实项目");
    expect(html).not.toContain("Boiling the ocean");
    expect(html).not.toContain("kn-task__who");
  });

  it("hides nested document-index file paths", () => {
    const html = markdownToKnHtml(`# Startup Design README

正文一段。

## Document index

### Control

- [\`00-control/PROGRESS.md\`](https://example.com/PROGRESS.md)

### Strategy

- [\`02-strategy/lean-canvas.md\`](https://example.com/lean-canvas.md)
`);
    expect(html).toContain("正文一段");
    expect(html).not.toContain("PROGRESS.md");
    expect(html).not.toContain("lean-canvas.md");
    expect(html).not.toContain("00-control");
    expect(html).not.toContain("Document index");
    expect(html).not.toContain("[](");
  });

  it("drops leftover markdown file links even without a Document index heading", () => {
    const html = markdownToKnHtml(`# 合域

## Strategy

- [\`02-strategy/lean-canvas.md\`](https://example.com/lean-canvas.md)
- 修改前版本归档
`);
    expect(html).toContain("修改前版本归档");
    expect(html).not.toContain("lean-canvas.md");
    expect(html).not.toContain("02-strategy");
  });

  it("puts the scorecard title left of the reliability score and skips a duplicate Verdict heading", () => {
    const html = markdownToKnHtml(
      `# 创业验证记分卡

| 维度 | Score (1-10) | 依据 |
| --- | --- | --- |
| Market size | 6 | [Estimate] 待补 |
| Overall | 6.0 | 平均 |

## Verdict

**VERDICT: CONDITIONAL — 有条件继续。**

[Opinion]
`,
      "scorecard",
    );
    const head = html.match(/<header class="kn-dochead">[\s\S]*?<\/header>/u)?.[0];
    expect(head).toBeTruthy();
    expect(head).toContain("创业验证记分卡");
    expect(head).toContain("kn-hero");
    expect(head!.indexOf("kn-doc-title")).toBeLessThan(head!.indexOf("kn-hero"));
    expect(html).not.toContain('class="kn-md-sec">判断');
    expect(html).not.toContain("kn-callout--verdict");
    expect(html).not.toContain("kn-tagged--opinion");
    expect(html).toContain("市场规模");
    expect(html).toContain("综合");
    expect(html).toContain(">分数<");
  });

  it("does not render an empty Flags heading as a 风险标记 callout", () => {
    const html = markdownToKnHtml(`# 研究结论

## Flags

### 红旗

- 商业验证样本只有一个发起人
`);
    expect(html).toContain("kn-flag--red");
    expect(html).toContain("商业验证样本");
    expect(html).not.toContain("kn-callout__label");
    expect(html).not.toMatch(/kn-md-sec">风险标记/);
  });

  it("hoists the research-gate title above the traffic-light and drops the raw heading", () => {
    const html = markdownToKnHtml(
      `# 🟡 Yellow Light — Conditional Proceed

建议继续封闭网络内验证。

# Research Gate: 家办非标项目 AI 投研与协作平台

**Confidence:** Medium
`,
      "research-gate",
    );
    expect(html).toContain("家办非标项目");
    expect(html).not.toContain("Research Gate");
    expect(html.indexOf("kn-doc-title")).toBeLessThan(html.indexOf("kn-gate"));
    expect(html).not.toContain("# 🟡");
    expect(html).not.toContain("Yellow Light");
    expect(html).toContain("建议继续封闭网络内验证");
  });

  it("renders 创始人调整 as a labeled aside, not a nested callout, and lifts overall confidence out", () => {
    const html = markdownToKnHtml(`# 研究结论

## Founder Pivot Overlay

[Decision]
当前滩头不是地理市场。

**总体把握: Medium** 综合把握中等；收入把握偏低。
`);
    expect(html).toContain("kn-pivot");
    expect(html).toContain("kn-pivot__label");
    expect(html).toContain("创始人调整");
    expect(html).not.toContain("kn-callout__label");
    expect(html).toContain("kn-md-lede");
    expect(html).toContain("综合把握中等");
    expect(html).not.toContain("总体把握");
    expect(html.indexOf("kn-pivot")).toBeLessThan(html.indexOf("kn-md-lede"));
  });

  it("turns shift + 含义 pairs into meaning cards inside the numbered section", () => {
    const html = markdownToKnHtml(`# 行业趋势

## 5. Behavioral Shifts

行为方向来自调查。

### 分析师/年轻一代自下而上采用

初级人员先试用，再说服投研负责人。

**含义：** 产品要同时给初级分析师效率，也给控制人治理与安全。

### 从“更多项目”转向“更快建立确信”

小规模私募担心的是材料质量，不是没有项目。

**含义：** 产品不应做成公开市场。
`);
    expect(html).toContain("行为变化");
    expect(html).toContain("kn-meaning");
    expect((html.match(/kn-meaning/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("kn-meaning__k");
    expect(html).toContain("分析师/年轻一代");
    expect(html).toContain("产品要同时给初级分析师效率");
    expect(html).not.toContain("kn-md-kicker");
    const section = html.match(
      /<section class="kn-md-section">[\s\S]*?<\/section>/u,
    )?.[0];
    expect(section).toBeTruthy();
    expect(section).toContain("kn-meaning");
    expect(section).toContain("更快建立确信");
  });

  it("turns sleep-style bold titles with 含义 into the same meaning cards", () => {
    const html = markdownToKnHtml(`# 行业趋势

一、行为变化

**年轻人先试无感监测**

高压脑力人群先从床头设备试起，而不是再买一块手表。

含义：
首版应做成卧室场景，而不是手环功能叠加。

**从监测转向主动干预**

现有产品停在记录，用户要的是第二天能睡。

**含义：** 差异化在干预闭环，不在多一个传感器。
`);
    expect(html).toContain("kn-meaning");
    expect(html).toContain("年轻人先试无感监测");
    expect(html).toContain("首版应做成卧室场景");
    expect(html).toContain("干预闭环");
    expect((html.match(/class="kn-meaning"/g) ?? []).length).toBe(2);
  });
});

describe("renderDeliverableChapterHtml", () => {
  it("joins multiple files without repeating catalog titles when each file has an h1", () => {
    const html = renderDeliverableChapterHtml([
      { title: "研究闸门", markdown: "# 继续" },
      { title: "结论可靠度", markdown: "# 假设仍多" },
    ]);
    expect(html).toContain("继续");
    expect(html).toContain("假设仍多");
    expect(html).toContain("kn-from-md-file");
    expect(html).not.toContain("kn-file-kicker");
    expect(html).not.toContain("结论可靠度");
  });

  it("does not repeat 研究闸门 when the file already has a Research Gate title", () => {
    const html = renderDeliverableChapterHtml([
      {
        title: "研究闸门",
        markdown: "# Research Gate: 家办非标项目\n\n正文。\n",
        id: "research-gate",
      },
      {
        title: "结论可靠度",
        markdown: "# 假设仍多\n\n一段说明。\n",
      },
    ]);
    expect(html).toContain("家办非标项目");
    expect(html).toContain("假设仍多");
    expect(html).not.toContain("结论可靠度");
    expect((html.match(/研究闸门/g) ?? []).length).toBe(0);
  });

  it("skips empty files and still renders the rest", () => {
    const html = renderDeliverableChapterHtml([
      { title: "空", markdown: "" },
      { title: "有内容", markdown: "一段话" },
    ]);
    expect(html).toContain("一段话");
    expect(html).not.toContain("空");
  });

  it("turns the first unnumbered h2 into the cover title", () => {
    const html = markdownToKnHtml(`## 功能规划

### 产品形态与核心交付

床头无屏。
`);
    expect(html).toContain("kn-doc-title");
    expect(html).toContain("功能规划");
    expect(html.indexOf("功能规划")).toBeLessThan(html.indexOf("产品形态"));
    expect(html).not.toContain("kn-file-kicker");
  });

  it("skips a title-only 结论可靠度 file when the sibling has the real body", () => {
    const html = renderDeliverableChapterHtml([
      { title: "结论可靠度", markdown: "# 结论可靠度\n" },
      { title: "研究闸门", markdown: "# 总体判断\n\n评分：4/10\n" },
    ]);
    expect(html).toContain("总体判断");
    expect(html).toContain("评分：4/10");
    expect(html.match(/结论可靠度/g) ?? []).toHaveLength(0);
  });

  it("renders a screening memo recommendation as a verdict card, not a swallowed section", () => {
    const html = markdownToKnHtml(`# 筛选备忘录

### 建议

Defer（暂缓）

理由：

1. 注册周期长
`);
    expect(html).toContain("kn-verdict kn-verdict--caution");
    expect(html).toContain("kn-verdict__kicker");
    expect(html).toContain("Defer");
    expect(html).toContain("暂缓");
    expect(html).toContain("注册周期长");
    expect(html).not.toContain('class="kn-md-topic">建议');
  });

  it("renders IC readiness as a gate, not a plain heading", () => {
    const html = markdownToKnHtml(`# 筛选备忘录

### IC 就绪度

Not Ready（未就绪）

原因：

- 临床证据不足
`);
    expect(html).toContain("kn-readiness kn-readiness--stop");
    expect(html).toContain('data-state="pass"');
    expect(html).toContain("is-on");
    expect(html).toContain("Not Ready");
    expect(html).toContain("未就绪");
    expect(html).toContain("临床证据不足");
  });

  it("lifts a one-line business summary and source footnote", () => {
    const html = markdownToKnHtml(`# 项目身份

### 11. 一句话业务

北京精冕科技以多模态诊断系统构建诊疗闭环。

本章依据项目资料 project-brief.md、theme-classification.md
`);
    expect(html).toContain("kn-lede-card");
    expect(html).toContain("kn-lede-card__label");
    expect(html).toContain("一句话业务");
    expect(html).not.toMatch(/kn-lede-card__label">\s*11/);
  });

  it("keeps screening subsection numbers like 1.1 and 2.1", () => {
    const html = markdownToKnHtml(`# 项目概览

### 1.1 初筛结论

总体评级 Watch。

### 1.2 项目基本情况

卖数字人克隆。

## 2. 行业与竞争

### 2.1 行业概况

内容电商。
`);
    expect(html).toContain("1.1 初筛结论");
    expect(html).toContain("1.2 项目基本情况");
    expect(html).toContain("2.1 行业概况");
  });

  it("keeps 资料 tags on source footnotes in lists", () => {
    const html = markdownToKnHtml(`# 需求

- 本章依据项目资料 精冕科技-让稳定触手可及v3.4.pdf [Data]
`);
    expect(html).toContain("kn-source-note");
    expect(html).toContain("kn-md-tag--data");
    expect(html).toContain("精冕科技-让稳定触手可及v3.4.pdf");
    expect(html).toContain("资料");
  });

  it("pairs 支持投资的论点 with 反方意见, not 最强证据", () => {
    const html = markdownToKnHtml(`# 结论

### 最强证据

- 内部工作流已经存在

### 9.3 反方意见

**支持投资的论点**

- 患者基数大

**反方意见**

- 注册周期不确定
`);
    expect(html).toContain("内部工作流已经存在");
    expect(html).toContain("kn-split");
    expect(html).toContain("支持投资的论点");
    expect(html).toContain("反方意见");
    expect(html).toContain("患者基数大");
    expect(html).toContain("注册周期不确定");
    expect(html).not.toMatch(
      /kn-split__col--go[\s\S]*最强证据[\s\S]*kn-split__col--stop[\s\S]*支持投资的论点/,
    );
    expect(html).toContain("9.3 反方意见");
  });

  it("pairs 正方 and 反方 as a split and chips 待补", () => {
    const html = markdownToKnHtml(`# 结论

### 正方意见

- 患者基数大

### 反方意见

- 待补
`);
    expect(html).toContain("kn-split");
    expect(html).toContain("kn-split__col--go");
    expect(html).toContain("kn-split__col--stop");
    expect(html).toContain("患者基数大");
    expect(html).toContain("kn-pending");
  });

  it("wraps 前提条件 as a terms callout", () => {
    const html = markdownToKnHtml(`# 结论

### 前提条件

若仍希望推进，需满足：

1. 专利权属清晰
`);
    expect(html).toContain("kn-callout--terms");
    expect(html).toContain("专利权属清晰");
  });

  it("turns a 初筛结论 block into a Chinese decision card", () => {
    const html = markdownToKnHtml(`# 筛选备忘录

### 1.1 初筛结论

**核心判断：值得保留联系并做一次验证。**

- 总体评级：**Watch（观察）**。
- 下一步建议：**request_information（先补关键事实）**。
- 支持理由：已有付费窗口。
- 主要保留意见：缺结算证据。
- 改变判断的条件：拿到独立客户交易。

### 1.2 项目基本情况

项目以巨东呈现。
`);
    expect(html).toContain("kn-decision kn-decision--caution");
    expect(html).toContain("观察");
    expect(html).toContain("下一步 · 先补关键事实");
    expect(html).toContain("值得保留联系");
    expect(html).not.toContain("Watch（观察）");
    expect(html).not.toContain("request_information");
    expect(html).toContain("项目以巨东呈现");
  });

  it("turns 投资结论 into a Defer card and keeps the rest of the section", () => {
    const html = markdownToKnHtml(`# 投资分析

### 1.1 投资结论

**投资建议：Defer（暂缓投资，继续定向验证）。**

**核心判断：证据不足以支持按投后1亿元投入。**

**内容状态：partial。**建议暂缓的是投资承诺。

**最强反对理由：**缺业务闭环。

### 1.2 项目摘要

摘要正文。
`);
    expect(html).toContain("kn-decision--dd");
    expect(html).toContain("暂缓投资");
    expect(html).toContain("继续定向验证");
    expect(html).toContain("部分核验");
    expect(html).toContain("最强反对理由");
    expect(html).toContain("摘要正文");
    expect(html).not.toMatch(/>Defer</);
  });

  it("draws an ownership tree when a paragraph lists equity percentages", () => {
    const html = markdownToKnHtml(`# 背景

## 3. 登记股权、控制与受益人

传媒：巨东文化55%，本分本心45%。文化：李元74.2298%、巨东合力合伙企业9.31%、深圳汇文4.9052%、北京朵朵花儿4.9%、陈海峰4.655%、深圳望禾2%。本分本心：吴钢100%。

仅按已披露的直接路径乘积，李元→文化→传媒为40.82639%。
`);
    expect(html).toContain("kn-cap");
    expect(html).toContain("kn-cap__node--root");
    expect(html).toContain("kn-cap__wires");
    expect(html).toContain("传媒");
    expect(html).toContain("55%");
    expect(html).toContain("吴钢");
    expect(html).toContain("40.82639%");
  });

  it("turns a mermaid ownership flowchart into cap figures", () => {
    const html = markdownToKnHtml(`# 股权

\`\`\`mermaid
flowchart TD
    LY[李元] -->|74.2298%| WH[巨东文化]
    HL[巨东合力] -->|9.31%| WH
    WG[吴钢] -->|100%| BF[本分本心]
    WH -->|55%| CM[巨东传媒]
    BF -->|45%| CM
    CM -->|40%| ZM[巨东造梦]
    BF -->|30%| ZM
\`\`\`
`);
    expect(html).toContain("kn-cap__wires");
    expect(html).toContain("巨东传媒");
    expect(html).toContain("巨东造梦");
    expect(html).toContain("kn-cap__hold");
    expect(html).toContain("持有 55%");
    expect(html).not.toContain("kn-pre");
  });

  it("turns a workpaper header list into a sheet with the conclusion as hero", () => {
    const html = markdownToKnHtml(`# 行业尽调：巨东数字克隆业务

- 项目与视角：巨东数字克隆业务股权投资 / 财务投资人。
- 工作流与状态：due-diligence /partial（本地分析已完成，外部证据未齐备）。
- 工件状态：working。
- 日期与输入：2026-09-17；SRC-022—026, 022, 028—031。
- 证据截止与依赖版本：evidenceCutoff=2026-09-17；dependencyVersion=CL-20260917-v1；lastReviewedAt=2026-09-17。
- 决策问题：表格里的数字、业务来源跟票仓里签的合约哪个业态算？
- 结论：股权存在真实使用场景，平台也是真人。
`);
    expect(html).toContain("kn-sheet");
    expect(html).toContain("kn-takeaway");
    expect(html).toContain("股权存在真实使用场景");
    expect(html).toContain("尽调");
    expect(html).toContain("工作稿");
    expect(html).toContain("决策问题");
    expect(html).not.toContain("evidenceCutoff");
    expect(html).not.toContain("taxonomy_version");
    expect(html).not.toContain("SRC-022");
    expect(html).not.toMatch(/<ul>/);
  });

  it("turns subsection 结论 and 核验状态 into a takeaway and chips", () => {
    const html = markdownToKnHtml(`# 行业尽调：巨东

## 2.2 市场需求

**结论：** 来源：需求宽度测量unsupported，任务真实采购路径未测量unverified。

**核验状态：** unsupported
`);
    expect(html).toContain("kn-takeaway");
    expect(html).toContain("未获支持");
    expect(html).toContain("未核验");
    expect(html).toContain("kn-statuschip");
    expect(html).not.toContain("unsupported");
  });

  it("turns 本章结论 into a takeaway and 判断 into a distinct block", () => {
    const html = markdownToKnHtml(`# 公司与团队

编制日期：2026年9月17日。文稿状态：工作稿；证据核验状态：部分完成。

**本章结论：尚不能仅凭55%/45%确认实际控制。当前最需优先解决的是：欠税线索、实缴不一致。**

**判断：** 减资引资本身可以是正常重组。

**关闭标准：** 取得章程和银行流水后才能关闭。
`);
    expect(html).toContain("kn-statusrow");
    expect(html).toContain("核验 · 部分核验");
    expect(html).toContain("文稿 · 工作稿");
    expect(html).toContain("kn-takeaway");
    expect(html).toContain("尚不能仅凭");
    expect(html).toContain("当前最需优先解决");
    expect(html).toContain("kn-next");
    expect(html).toContain("欠税线索");
    expect(html).toContain("kn-judgment");
    expect(html).toContain("正常重组");
    expect(html).toContain("关闭标准");
  });
});
