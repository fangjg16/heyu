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
    expect(html).toContain("<h2>");
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
    expect(html).toContain("kn-score-sum");
    expect(html).toContain("Phase");
    expect(html).toContain("判断");
    expect(html).toContain("CONDITIONAL");
    expect(html).toContain("kn-flag--red");
    expect(html).toContain("kn-flag--amber");
    expect(html).toContain("商业模式清晰度");
  });

  it("marks [Data] tags", () => {
    const html = markdownToKnHtml("**[Data]** 官网可核验。");
    expect(html).toContain("kn-md-tag");
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
