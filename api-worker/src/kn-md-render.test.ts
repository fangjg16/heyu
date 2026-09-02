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
    expect(html).toContain("kn-masthead");
    expect(html).toContain("阶段");
    expect(html).toContain("把握");
    expect(html).not.toContain("kn-score-sum");
    expect(html).toContain("判断");
    expect(html).toContain("CONDITIONAL");
    expect(html).toContain("kn-flag--red");
    expect(html).toContain("kn-flag--amber");
    expect(html).toContain("商业模式清晰度");
  });

  it("marks [Data] tags", () => {
    const html = markdownToKnHtml("**[Data]** 官网可核验。");
    expect(html).toContain("kn-md-tag");
    expect(html).toContain("kn-md-tag--data");
    expect(html).toContain("kn-tagged--data");
    expect(html).toContain("Data");
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

  it("turns file headers into a masthead grid", () => {
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
    expect(html).toContain("kn-masthead");
    expect(html).toContain("kn-masthead__cell--wide");
    expect(html).toContain("阶段");
    expect(html).toContain("项目");
    expect(html).toContain("进度");
    expect(html).toContain("日期");
    expect(html).toContain("判断");
    expect(html).toContain("把握");
    expect(html).toContain("jfo-ai-investment-platform");
    expect(html).not.toContain("<hr");
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
    expect(html).toContain("Strongest evidence");
    expect(html).toContain("Weakest links");
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
    expect(html).toContain("kn-masthead");
    expect(html).toContain("kn-md-section");
    expect(html).toContain("kn-md-h");
    expect(html).toContain("kn-md-h__t");
    expect(html).toContain("Competitive Overview");
    expect(html).toContain("kn-section-conf");
    expect(html).toContain("本节把握");
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
    expect(section).toContain("Executive View");
    expect(section).toContain("kn-md-subblock");
    expect(section).toContain('class="kn-md-sub"');
    expect(section).toContain("kn-md-sub__k");
    expect(section).toContain("家办直接投资");
    expect(html.indexOf("kn-md-h")).toBeLessThan(html.indexOf("kn-md-sub"));
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

  it("skips empty files and still renders the rest", () => {
    const html = renderDeliverableChapterHtml([
      { title: "空", markdown: "" },
      { title: "有内容", markdown: "一段话" },
    ]);
    expect(html).toContain("一段话");
    expect(html).not.toContain("空");
  });
});
