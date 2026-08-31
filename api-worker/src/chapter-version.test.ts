import { describe, expect, it } from "vitest";
import {
  bumpChapterVersion,
  formatChapterVersion,
  formatChapterVersionLabel,
  formatOverviewVersionLabel,
  isOverviewOnlyPublish,
  nextChapterVersion,
  parseChapterVersion,
  researchChaptersComplete,
} from "./chapter-version";

describe("chapter-version", () => {
  it("formats the old 200 encoding as 2.0, not 200", () => {
    expect(formatChapterVersion(200)).toBe("2.0");
    expect(formatChapterVersionLabel(200)).toBe("v2.0");
    expect(parseChapterVersion(200)).toEqual({
      major: 2,
      minor: 0,
      patch: 0,
    });
  });

  it("keeps 0.x until all research chapters exist, then 1.0", () => {
    expect(formatChapterVersion(nextChapterVersion(0, { allResearchComplete: false }))).toBe(
      "0.1",
    );
    expect(
      formatChapterVersion(nextChapterVersion(1, { allResearchComplete: false })),
    ).toBe("0.2");
    expect(
      formatChapterVersion(nextChapterVersion(2, { allResearchComplete: true })),
    ).toBe("1.0");
    expect(nextChapterVersion(0, { allResearchComplete: true })).toBe(10_000);
  });

  it("after 1.0 supports patch, minor, and major", () => {
    const v10 = 10_000;
    expect(formatChapterVersionLabel(nextChapterVersion(v10, { bump: "patch" }))).toBe(
      "v1.0.1",
    );
    expect(formatChapterVersionLabel(nextChapterVersion(v10, { bump: "minor" }))).toBe(
      "v1.1",
    );
    expect(formatChapterVersionLabel(nextChapterVersion(v10, { bump: "major" }))).toBe(
      "v2.0",
    );
    expect(
      formatChapterVersionLabel(
        nextChapterVersion(10_100, { bump: "patch" }),
      ),
    ).toBe("v1.1.1");
  });

  it("bumps legacy 2.0 (200) into 2.1 / 2.0.1 / 3.0", () => {
    expect(formatChapterVersionLabel(bumpChapterVersion(200, "minor"))).toBe("v2.1");
    expect(formatChapterVersionLabel(bumpChapterVersion(200, "patch"))).toBe("v2.0.1");
    expect(formatChapterVersionLabel(bumpChapterVersion(200, "major"))).toBe("v3.0");
  });

  it("researchChaptersComplete requires all research chapters of that kind", () => {
    const html: Record<string, string> = {
      "project-summary": "<p>a</p>",
      "industry-competition": "<p>a</p>",
    };
    expect(researchChaptersComplete(html)).toBe(false);
    expect(researchChaptersComplete(html, "mature")).toBe(false);
    const full = {
      "project-summary": "<p>a</p>",
      "industry-competition": "<p>a</p>",
      "business-technology": "<p>a</p>",
      "company-team": "<p>a</p>",
      "financial-diligence": "<p>a</p>",
      "investment-structure-returns": "<p>a</p>",
      "investment-risks": "<p>a</p>",
      "diligence-gaps": "<p>a</p>",
      "investment-conclusion": "<p>a</p>",
    };
    expect(researchChaptersComplete(full, "mature")).toBe(true);
    expect(researchChaptersComplete(full, "early")).toBe(false);
    const early = {
      "founder-interview": "<p>a</p>",
      "market-discovery": "<p>a</p>",
      strategy: "<p>a</p>",
      brand: "<p>a</p>",
      product: "<p>a</p>",
      financials: "<p>a</p>",
      validation: "<p>a</p>",
    };
    expect(researchChaptersComplete(early, "early")).toBe(true);
  });

  it("treats overview-only publish separately from knowledge network bump", () => {
    expect(formatOverviewVersionLabel(3)).toBe("ov-3");
    expect(isOverviewOnlyPublish(["project-overview", "project-graph"])).toBe(
      true,
    );
    expect(isOverviewOnlyPublish(["snapshot", "project-overview"])).toBe(false);
  });
});
