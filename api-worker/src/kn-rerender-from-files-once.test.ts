import { describe, expect, it } from "vitest";
import {
  HEYU_RERENDER_ONCE_NAME,
  HEYU_RERENDER_ONCE_PROJECT_ID,
  isHeyuRerenderOnceProject,
  knSectionsToRerenderFromFiles,
} from "./kn-rerender-from-files-once";

describe("heyu one-shot rerender from files", () => {
  it("matches the heyu project id or exact name", () => {
    expect(isHeyuRerenderOnceProject(HEYU_RERENDER_ONCE_PROJECT_ID)).toBe(true);
    expect(isHeyuRerenderOnceProject("other", HEYU_RERENDER_ONCE_NAME)).toBe(
      true,
    );
    expect(isHeyuRerenderOnceProject("other", "睡眠空间AI")).toBe(false);
  });

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
});
