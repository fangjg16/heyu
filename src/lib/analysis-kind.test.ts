import { describe, expect, it } from "vitest";
import {
  ANALYSIS_KIND_LABELS,
  ANALYSIS_KIND_OPTIONS,
  analysisKindLabel,
  parseAnalysisKind,
} from "./analysis-kind";

describe("analysis-kind labels", () => {
  it("covers three selectable kinds", () => {
    expect(ANALYSIS_KIND_OPTIONS.map((o) => o.id)).toEqual([
      "mature",
      "early",
      "acquire",
    ]);
    expect(ANALYSIS_KIND_LABELS.mature).toBe("投资");
    expect(ANALYSIS_KIND_LABELS.early).toBe("创业");
    expect(ANALYSIS_KIND_LABELS.acquire).toBe("收购经营");
  });

  it("labels unset as 未选定", () => {
    expect(analysisKindLabel(null)).toBe("未选定");
    expect(analysisKindLabel("mature")).toBe("投资");
    expect(parseAnalysisKind("investment")).toBe("mature");
  });
});
