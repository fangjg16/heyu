import { describe, expect, it } from "vitest";
import {
  extractMarkdownBody,
  isWriteReceiptMarkdown,
  looksLikeMarkdownFile,
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

describe("extractMarkdownBody", () => {
  it("unwraps a markdown fence", () => {
    expect(extractMarkdownBody("```md\n# 标题\n\n正文\n```")).toBe(
      "# 标题\n\n正文",
    );
  });
});
