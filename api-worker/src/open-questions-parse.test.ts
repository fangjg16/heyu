import { describe, expect, it } from "vitest";
import { parseOpenQuestionsFromHtml } from "./open-questions-parse";

describe("parseOpenQuestionsFromHtml", () => {
  it("extracts P1/P2 items and skips 待补", () => {
    const html = `
<details>
  <summary>P1 紧急 — 资金 <span>2 项</span></summary>
  <div>
    <p>① 银行资信证明是否齐备？</p>
    <p>② 待补</p>
  </div>
</details>
<details>
  <summary>P2 重要 — 合规</summary>
  <div>
    <p>③ 牌照申请进度如何？</p>
  </div>
</details>`;
    const items = parseOpenQuestionsFromHtml(html);
    expect(items).toEqual([
      { text: "银行资信证明是否齐备？", priority: "P1" },
      { text: "牌照申请进度如何？", priority: "P2" },
    ]);
  });

  it("falls back without details to P2 paragraphs", () => {
    const html = `<p>关键合同条款是否含回购？</p><p>待补</p>`;
    const items = parseOpenQuestionsFromHtml(html);
    expect(items).toEqual([
      { text: "关键合同条款是否含回购？", priority: "P2" },
    ]);
  });
});
