import { describe, expect, it } from "vitest";
import { parseOpenQuestionsFromHtml, inferQuestionKind } from "./open-questions-parse";

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

  it("extracts list items from P1/P2 accordion cards", () => {
    const html = `
<details open>
  <summary>P1 紧急 — 标的确认 <span>2 项</span></summary>
  <ol>
    <li><strong>具体目标公司是谁？</strong><br>当前仅有行业分析。<br>→ 需要 BP</li>
    <li><strong>待补</strong><br>待补<br>→ 待补</li>
  </ol>
</details>
<details>
  <summary>P2 重要 — 财务</summary>
  <ol>
    <li>已上线作品的播放量与收入数据是否齐备？</li>
  </ol>
</details>`;
    const items = parseOpenQuestionsFromHtml(html);
    expect(items).toEqual([
      {
        text: "具体目标公司是谁？： 当前仅有行业分析。 → 需要 BP",
        priority: "P1",
      },
      { text: "已上线作品的播放量与收入数据是否齐备？", priority: "P2" },
    ]);
  });

  it("extracts gap-tracking description column and maps urgency", () => {
    const html = `
<table>
  <thead><tr>
    <th>缺口编号</th><th>缺口描述</th><th>来源</th><th>紧急度</th><th>影响层级</th><th>状态</th>
  </tr></thead>
  <tbody>
    <tr><td>G-001</td><td>开工法定定义未确认</td><td>L2</td><td>Blocking</td><td>L3</td><td>Not Started</td></tr>
    <tr><td>G-002</td><td>待补</td><td>L2</td><td>Precision</td><td>L3</td><td>Not Started</td></tr>
    <tr><td>G-003</td><td>历史租金合同尚未取得</td><td>L0</td><td>Enhancement</td><td>L4</td><td>Requested</td></tr>
  </tbody>
</table>`;
    const items = parseOpenQuestionsFromHtml(html);
    expect(items).toEqual([
      { text: "开工法定定义未确认", priority: "P1" },
      { text: "历史租金合同尚未取得", priority: "P3" },
    ]);
  });
});

describe("inferQuestionKind", () => {
  it("does not treat 技术人员 as a tech question", () => {
    expect(
      inferQuestionKind("团队成员身份与能力核实 胡敏身份未核实，技术人员背景材料未提供"),
    ).toBe("other");
  });

  it("still classifies actual tech claims as tech", () => {
    expect(
      inferQuestionKind("NKG / 多 Agent 核心技术主张未验证，专利与模型评测缺失"),
    ).toBe("tech");
  });
});
