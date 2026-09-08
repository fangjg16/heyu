import { describe, expect, it } from "vitest";
import {
  extractMarkdownBody,
  isWriteReceiptMarkdown,
  looksLikeAnalysisBody,
  looksLikeMarkdownFile,
  shouldReuseExistingDeliverable,
} from "./deliverable-markdown-quality";

const SCORECARD_RECEIPT = `综合总评文件已写入 \`AI生成/startup/00-overview/scorecard.md\`（14.2KB）。

文件按 startup-design 方法组织，覆盖：项目概况、总体判断（4/10 + 四条前提）、行业与市场、业务、验证（19 条核心假设）、常见失败模式、Flags（9 红 + 12 黄）、可靠度总览、结论与建议。

缺证据处标「待补」，未编造数据。下一层知识网络可直接据此填写 project-scorecard 章节模板。`;

const COMPETITOR_RECEIPT = `竞争格局 Markdown 总文件已写完。

文件已写入 \`AI生成/startup/01-discovery/competitor-landscape.md\`，按 \`startup-competitors\` 方法组织，覆盖：

- 竞争者总览（六类对手）
- 功能矩阵
- 定价与收费模式
- 5 张对战卡
- 定位图
- 竞争壁垒评估
- Flags（5 红 + 5 黄）

缺证据处标「待补」。下一层知识网络可直接据此填写章节模板。`;

describe("isWriteReceiptMarkdown", () => {
  it("rejects the scorecard and competitor receipt texts", () => {
    expect(isWriteReceiptMarkdown(SCORECARD_RECEIPT)).toBe(true);
    expect(isWriteReceiptMarkdown(COMPETITOR_RECEIPT)).toBe(true);
    expect(looksLikeMarkdownFile(SCORECARD_RECEIPT)).toBe(false);
    expect(looksLikeMarkdownFile(COMPETITOR_RECEIPT)).toBe(false);
  });

  it("accepts a real analysis with headings and tables", () => {
    const md = `# 竞争格局

## 总览

市场并不空白。

| 名称 | 产品 |
| --- | --- |
| Reuben AI | 私募运营 OS |
`;
    expect(isWriteReceiptMarkdown(md)).toBe(false);
    expect(looksLikeMarkdownFile(md.repeat(8))).toBe(true);
  });
});

describe("shouldReuseExistingDeliverable", () => {
  it("reuses a long analysis and refuses a write receipt", () => {
    const analysis = `# Lean Canvas

## 1. Problem

家族办公室月报对不上决策。

## 2. Customer Segments

独立家族办公室 CIO。
`.repeat(6);
    expect(shouldReuseExistingDeliverable(analysis)).toBe(true);
    expect(shouldReuseExistingDeliverable(SCORECARD_RECEIPT)).toBe(false);
    expect(shouldReuseExistingDeliverable(null)).toBe(false);
  });
});

describe("extractMarkdownBody", () => {
  it("unwraps a markdown fence", () => {
    expect(extractMarkdownBody("```md\n# 标题\n\n正文\n```")).toBe(
      "# 标题\n\n正文",
    );
  });
});

describe("looksLikeAnalysisBody", () => {
  it("accepts Chinese 一、 / 核心结论 analysis without # headings", () => {
    const md = `核心结论

市场并不空白，现有工具把运营做成了记录，没有做成判断。家办投研不是再做一个知识库，而是把材料收成判断。

一、竞争者总览

六类对手里，真正贴近「家办投资运营」的只有两家。其余是通用知识库或咨询外包。

二、功能矩阵

对战卡按产品、交付、收费、证据四列写。缺公开数据处标待补，不编造份额。
`.repeat(4);
    expect(md.length).toBeGreaterThanOrEqual(400);
    expect(looksLikeMarkdownFile(md)).toBe(false);
    expect(looksLikeAnalysisBody(md)).toBe(true);
    expect(isWriteReceiptMarkdown(md)).toBe(false);
  });

  it("rejects competitor write receipts", () => {
    expect(looksLikeAnalysisBody(COMPETITOR_RECEIPT)).toBe(false);
    expect(looksLikeAnalysisBody(SCORECARD_RECEIPT)).toBe(false);
  });

  it("accepts a long body even without numbered sections", () => {
    const md = "这是一段没有标题的分析正文。".repeat(80);
    expect(md.length).toBeGreaterThanOrEqual(800);
    expect(looksLikeAnalysisBody(md)).toBe(true);
  });
});
