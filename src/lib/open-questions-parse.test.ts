import { describe, expect, it } from "vitest";
import { inferQuestionKind } from "./open-questions-parse";

describe("inferQuestionKind", () => {
  it("does not treat 技术人员 as a tech question", () => {
    expect(
      inferQuestionKind("团队成员身份与能力核实 胡敏身份未核实，技术人员背景材料未提供"),
    ).toBe("other");
  });

  it("classifies product, fundraising and model-boundary questions", () => {
    expect(
      inferQuestionKind("“自研、无依赖” 与第三方模型/平台的边界"),
    ).toBe("tech");
    expect(inferQuestionKind("产品当前状态与规划状态")).toBe("business");
    expect(inferQuestionKind("艺人及数字人数量")).toBe("business");
    expect(inferQuestionKind("收益分配及费用瀑布")).toBe("finance");
    expect(inferQuestionKind("5,000万元募集资金的实际用途")).toBe("finance");
    expect(inferQuestionKind("基金方案的正式版本")).toBe("finance");
  });
});
