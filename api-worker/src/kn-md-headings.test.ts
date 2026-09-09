import { describe, expect, it } from "vitest";
import { extractMarkdownHeadingSlices } from "./kn-md-headings";

const INDUSTRY = `# 行业尽调

## 1. 执行结论与证据边界

总评。

## 2. 行业定义与坐标

定义正文。

## 3. 行业逻辑与需求形成

需求正文。

## 4. 发展历程与关键拐点

历程正文。

## 5. 市场现状、规模与增长

规模正文。

## 6. 渗透、驱动因素与约束

驱动正文。

## 7. 价值链与利润池

链条正文。

## 8. 竞争结构与参与者

竞争正文。

## 9. 趋势、技术与监管

趋势正文。
`;

const BUSINESS = `# 商业尽调

## 2. 真实业务与边界

业务正文。

## 4. 产品与技术

### 产品情况

产品正文。

### 技术情况

技术正文。

## 5. 商业模式与交易闭环

模式正文。

## 6. 运营、组织与关键依赖

组织正文。
`;

describe("extractMarkdownHeadingSlices", () => {
  it("ignores numbered prefixes and concatenates requested industry slices", () => {
    const overview = extractMarkdownHeadingSlices(INDUSTRY, [
      "行业定义与坐标",
      "市场现状、规模与增长",
      "发展历程与关键拐点",
    ]);
    expect(overview).toContain("定义正文");
    expect(overview).toContain("规模正文");
    expect(overview).toContain("历程正文");
    expect(overview).not.toContain("需求正文");
    expect(overview).not.toContain("总评");
  });

  it("splits product and technology subsections", () => {
    expect(
      extractMarkdownHeadingSlices(BUSINESS, ["产品情况"]),
    ).toContain("产品正文");
    expect(
      extractMarkdownHeadingSlices(BUSINESS, ["产品情况"]),
    ).not.toContain("技术正文");
    expect(
      extractMarkdownHeadingSlices(BUSINESS, ["技术情况"]),
    ).toContain("技术正文");
    expect(
      extractMarkdownHeadingSlices(BUSINESS, ["运营、组织与关键依赖"]),
    ).toContain("组织正文");
  });

  it("returns empty when none of the titles exist", () => {
    expect(extractMarkdownHeadingSlices(INDUSTRY, ["不存在的标题"])).toBe("");
  });
});
