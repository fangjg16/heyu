import { describe, expect, it } from "vitest";
import {
  deliverableDraftId,
  fullDraftSectionIds,
  questionsSectionIdForKind,
  researchSectionsForKind,
  sectionLabel,
} from "./kn-catalog";

describe("kn-catalog", () => {
  it("gives each kind its own research chapters", () => {
    expect(researchSectionsForKind("mature").map((s) => s.id)).toContain(
      "project-summary",
    );
    expect(researchSectionsForKind("mature").map((s) => s.id)).not.toContain(
      "exec-verdict",
    );
    expect(researchSectionsForKind("early").map((s) => s.id)).toEqual([
      "exec-summary",
      "project-scorecard",
      "research-gate",
      "target-audience",
      "market-analysis",
      "competitor-landscape",
      "industry-trends",
      "lean-business-model",
      "value-proposition",
      "positioning",
      "go-to-market",
      "mvp-definition",
      "user-journey",
      "feature-prioritization",
      "projections",
      "revenue-model",
      "cost-structure",
      "risk-analysis",
      "assumptions-tracker",
      "validation-playbook",
      "action-plan-30d",
    ]);
    expect(
      researchSectionsForKind("early").find((s) => s.id === "exec-summary")
        ?.label,
    ).toBe("执行摘要");
    expect(researchSectionsForKind("early").some((s) => s.id === "brand")).toBe(
      false,
    );
  });

  it("maps pending-question section by kind", () => {
    expect(questionsSectionIdForKind("mature")).toBe("diligence-gaps");
    expect(questionsSectionIdForKind("early")).toBe("assumptions-tracker");
  });

  it("puts project overview last on a full draft run", () => {
    const early = fullDraftSectionIds("early");
    expect(early.at(-1)).toBe("project-overview");
    expect(early).toContain("competitor-landscape");
    expect(early).toContain("exec-summary");
    expect(early.indexOf("research-gate")).toBeLessThan(
      early.indexOf("exec-summary"),
    );
    expect(early.at(-2)).toBe("project-scorecard");
    expect(early).not.toContain("founder-interview");
    expect(fullDraftSectionIds("mature").at(-1)).toBe("project-overview");
  });

  it("uses seven top-level chapters for mature CapitalLens", () => {
    expect(researchSectionsForKind("mature").map((s) => s.id)).toEqual([
      "project-summary",
      "industry-competition",
      "business-technology",
      "company-team",
      "financial-diligence",
      "risk-return",
      "diligence-gaps",
    ]);
    const mature = fullDraftSectionIds("mature");
    expect(mature.at(-1)).toBe("project-overview");
    expect(mature.at(-2)).toBe("diligence-gaps");
    expect(mature).toContain("industry-competition");
    expect(mature).toContain("risk-return");
    expect(mature).not.toContain("industry-overview");
    expect(mature).not.toContain("investment-conclusion");
    expect(mature).not.toContain("investment-risks");
  });

  it("labels deliverable draft items with the file title, not a path", () => {
    expect(sectionLabel(deliverableDraftId("market-analysis"))).toBe("市场分析");
    expect(sectionLabel(deliverableDraftId("readme"))).toBe("执行摘要");
    expect(sectionLabel(deliverableDraftId("source-register"))).toBe("引用来源");
    expect(sectionLabel("financial-diligence", "mature")).toBe("财务分析");
    expect(sectionLabel("risk-return", "mature")).toBe("风险与回报");
    expect(sectionLabel("industry-competition", "mature")).toBe("行业与竞争");
    expect(sectionLabel("investment-structure-returns", "mature")).toBe(
      "估值与回报",
    );
    expect(sectionLabel("assumption-validation", "mature")).toBe("假设验证");
  });
});
