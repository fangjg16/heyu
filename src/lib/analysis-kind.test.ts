import { describe, expect, it } from "vitest";
import {
  ANALYSIS_KIND_LABELS,
  ANALYSIS_KIND_OPTIONS,
  analysisKindFormOptions,
  analysisKindLabel,
  parseAnalysisKind,
} from "./analysis-kind";

describe("analysis-kind labels", () => {
  it("lets projects pick 投资 or 创业 only", () => {
    expect(analysisKindFormOptions().map((o) => o.id)).toEqual([
      "mature",
      "early",
    ]);
    expect(analysisKindFormOptions("mature").map((o) => o.id)).toEqual([
      "mature",
      "early",
    ]);
    expect(ANALYSIS_KIND_OPTIONS.map((o) => o.id)).toEqual(["mature", "early"]);
    expect(ANALYSIS_KIND_LABELS.mature).toBe("投资");
    expect(ANALYSIS_KIND_LABELS.early).toBe("创业");
    expect(ANALYSIS_KIND_OPTIONS.find((o) => o.id === "early")?.description).toBe(
      "从零验证产品与市场，可做用户访谈。不设项目协作。",
    );
  });

  it("reads legacy 收购经营 rows as 投资", () => {
    expect(parseAnalysisKind("acquire")).toBe("mature");
    expect(parseAnalysisKind("buy-to-build")).toBe("mature");
    expect(parseAnalysisKind("acquisition")).toBe("mature");
    expect(parseAnalysisKind("eta")).toBe("mature");
  });

  it("labels unset as 未选定", () => {
    expect(analysisKindLabel(null)).toBe("未选定");
    expect(analysisKindLabel("mature")).toBe("投资");
    expect(parseAnalysisKind("investment")).toBe("mature");
  });
});
