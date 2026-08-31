import { describe, expect, it } from "vitest";
import {
  fullDraftSectionIds,
  questionsSectionIdForKind,
  researchSectionsForKind,
} from "./kn-catalog";

describe("kn-catalog", () => {
  it("gives each kind its own research chapters", () => {
    expect(researchSectionsForKind("mature").map((s) => s.id)).toContain(
      "project-summary",
    );
    expect(researchSectionsForKind("acquire").map((s) => s.id)).toContain(
      "exec-verdict",
    );
    expect(researchSectionsForKind("early").map((s) => s.id)).toEqual([
      "founder-interview",
      "market-discovery",
      "strategy",
      "brand",
      "product",
      "financials",
      "validation",
    ]);
  });

  it("maps pending-question section by kind", () => {
    expect(questionsSectionIdForKind("mature")).toBe("diligence-gaps");
    expect(questionsSectionIdForKind("acquire")).toBe("open-items-exceptions");
    expect(questionsSectionIdForKind("early")).toBe("validation");
  });

  it("puts project overview last on a full draft run", () => {
    const early = fullDraftSectionIds("early");
    expect(early.at(-1)).toBe("project-overview");
    expect(early).toContain("founder-interview");
    expect(fullDraftSectionIds("mature").at(-1)).toBe("project-overview");
    expect(fullDraftSectionIds("acquire").at(-1)).toBe("project-overview");
  });
});
