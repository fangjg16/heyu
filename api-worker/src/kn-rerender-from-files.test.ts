import { describe, expect, it } from "vitest";
import { knSectionsToRerenderFromFiles } from "./kn-rerender-from-files";

describe("rerender knowledge chapters from files", () => {
  it("requeues research chapters that render from files, not overview", () => {
    const ids = knSectionsToRerenderFromFiles("early");
    expect(ids).not.toContain("project-overview");
    expect(ids).toContain("exec-summary");
    expect(ids).toContain("project-scorecard");
    expect(ids).toContain("lean-business-model");
    expect(ids).toContain("competitor-landscape");
    expect(ids).toContain("mvp-definition");
    expect(ids).toContain("risk-analysis");
  });

  it("covers mature research chapters that render from files", () => {
    const ids = knSectionsToRerenderFromFiles("mature");
    expect(ids).not.toContain("project-overview");
    expect(ids).toContain("project-summary");
    expect(ids).toContain("industry-competition");
    expect(ids).toContain("investment-conclusion");
  });
});
