import { describe, expect, it } from "vitest";
import {
  capitallensKnSources,
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
  it("treats due-diligence pipeline as diligence even without extra files", () => {
    expect(
      resolveKnWorkstream({ pipelineStage: "due-diligence" }),
    ).toBe("diligence");
    expect(
      resolveKnWorkstream({ pipelineStage: "deal-screening" }),
    ).toBe("screening");
    expect(
      resolveKnWorkstream({
        pipelineStage: "deal-screening",
        hasDiligenceBody: true,
      }),
    ).toBe("diligence");
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
    ).toEqual(["screening-memo"]);
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
