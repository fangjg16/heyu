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
    expect(html).toContain("把握中等");
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

  it("turns block quotes into callouts", () => {
    const html = markdownToKnHtml("> 判断：先验证付费意愿。");
    expect(html).toContain("blockquote");
    expect(html).toContain("kn-callout");
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
    expect(html).toContain("kn-md-h");
    expect(html).toContain("kn-md-h__t");
    expect(html).toContain("竞争全景");
    expect(html).toContain("kn-section-conf");
    expect(html).toContain("本节把握");
    expect(html).toContain("kn-badge");
    expect(html).toContain("kn-md-headrow");
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
    expect(section).toContain("kn-md-h");
    expect(section).toContain("总览");
    expect(section).toContain("kn-md-subblock");
    expect(section).toContain('class="kn-md-sub"');
    expect(section).toContain("kn-md-sub__k");
    expect(section).toContain("家办直接投资");
    expect(html.indexOf("kn-md-h")).toBeLessThan(html.indexOf("kn-md-sub"));
  });

  it("renders #### and 3.1 headings instead of leaving hashes", () => {
    const html = markdownToKnHtml(`# 三、业务

#### 3.1 问题

高压脑力上班族过载。

#### 3.2 方案

床头被动监测。
`);
    expect(html).not.toContain("####");
    expect(html).toContain("kn-md-sub");
    expect(html).toContain("问题");
    expect(html).toContain("方案");
  });

  it("treats 一、 lines as headings", () => {
    const html = markdownToKnHtml(`# 目标客户分析

一、核心痛点人群

高压脑力上班族。
`);
    expect(html).toContain("kn-md-h");
    expect(html).toContain("核心痛点人群");
    expect(html).toContain("高压脑力上班族");
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
    expect(html).toContain("kn-section-conf");
    expect(html).toContain("本节把握");
    expect(html).toContain("把握中等");
    expect(html).toContain("kn-badge");
    expect(html).not.toContain("<strong>Section confidence");
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
    expect(html).toContain("把握偏低");
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

  it("writes 三、 and the title on one line", () => {
    const html = markdownToKnHtml(`# 市场

### 三、行业与市场

切分按场景。
`);
    expect(html).toContain("kn-md-h");
    expect(html).toMatch(/kn-md-h__n">三、</);
    expect(html).toContain("行业与市场");
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
});

describe("renderDeliverableChapterHtml", () => {
  it("joins multiple files with section titles", () => {
    const html = renderDeliverableChapterHtml([
      { title: "研究闸门", markdown: "# 继续" },
      { title: "结论可靠度", markdown: "# 假设仍多" },
    ]);
    expect(html).toContain("研究闸门");
    expect(html).toContain("结论可靠度");
    expect(html).toContain("kn-from-md-file");
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
    expect(html).toContain("结论可靠度");
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

  it("skips a title-only 结论可靠度 file when the sibling has the real body", () => {
    const html = renderDeliverableChapterHtml([
      { title: "结论可靠度", markdown: "# 结论可靠度\n" },
      { title: "研究闸门", markdown: "# 总体判断\n\n评分：4/10\n" },
    ]);
    expect(html).toContain("总体判断");
    expect(html).toContain("评分：4/10");
    expect(html.match(/结论可靠度/g) ?? []).toHaveLength(0);
  });
});
