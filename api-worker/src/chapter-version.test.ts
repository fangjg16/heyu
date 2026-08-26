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

  it("researchChaptersComplete requires all 13 research chapters", () => {
    const html: Record<string, string> = {
      snapshot: "<p>a</p>",
      objectives: "<p>a</p>",
    };
    expect(researchChaptersComplete(html)).toBe(false);
    const full = {
      snapshot: "<p>a</p>",
      objectives: "<p>a</p>",
      industry: "<p>a</p>",
      legal: "<p>a</p>",
      benchmarks: "<p>a</p>",
      business: "<p>a</p>",
      returns: "<p>a</p>",
      capabilities: "<p>a</p>",
      ownership: "<p>a</p>",
      diligence: "<p>a</p>",
      risks: "<p>a</p>",
      questions: "<p>a</p>",
      framework: "<p>a</p>",
    };
    expect(researchChaptersComplete(full)).toBe(true);
  });

  it("treats overview-only publish separately from knowledge network bump", () => {
    expect(formatOverviewVersionLabel(3)).toBe("ov-3");
    expect(isOverviewOnlyPublish(["project-overview", "project-graph"])).toBe(
      true,
    );
    expect(isOverviewOnlyPublish(["snapshot", "project-overview"])).toBe(false);
  });
});
