import { describe, expect, it } from "vitest";
import {
  composeLegacyChapterHtml,
  mergeMatureDraftItemsForPublish,
  presentMatureDraftItems,
  resolveMappedChapterHtml,
} from "./kn-legacy-map";

describe("kn-legacy-map", () => {
  it("maps snapshot+objectives onto project-summary when the new id is empty", () => {
    const htmlById = new Map<string, string>([
      ["snapshot", "<p>快照</p>"],
      ["objectives", "<p>概况</p>"],
    ]);
    const html = resolveMappedChapterHtml("project-summary", htmlById);
    expect(html).toContain("快照");
    expect(html).toContain("概况");
    expect(html).toContain("项目快照");
  });

  it("keeps existing new-id html", () => {
    const htmlById = new Map<string, string>([
      ["project-summary", "<p>新章</p>"],
      ["snapshot", "<p>旧</p>"],
    ]);
    expect(resolveMappedChapterHtml("project-summary", htmlById)).toBe(
      "<p>新章</p>",
    );
  });

  it("presents old draft items under new catalog ids", () => {
    const items = presentMatureDraftItems([
      {
        sectionId: "framework",
        html: "<p>闸门</p>",
        status: "ok",
      },
    ]);
    expect(items.some((i) => i.sectionId === "investment-conclusion")).toBe(
      true,
    );
    expect(
      items.find((i) => i.sectionId === "investment-conclusion")?.html,
    ).toContain("闸门");
  });

  it("publishes merged html onto the new section id", () => {
    const merged = mergeMatureDraftItemsForPublish([
      { sectionId: "snapshot", html: "<p>A</p>", status: "ok" },
      { sectionId: "objectives", html: "<p>B</p>", status: "ok" },
      { sectionId: "project-overview", html: "<p>OV</p>", status: "ok" },
    ]);
    expect(merged.map((i) => i.sectionId).sort()).toEqual([
      "project-overview",
      "project-summary",
    ]);
    const summary = merged.find((i) => i.sectionId === "project-summary");
    expect(summary?.html).toContain("A");
    expect(summary?.html).toContain("B");
    expect(merged.some((i) => i.sectionId === "snapshot")).toBe(false);
  });

  it("returns a single part unchanged", () => {
    expect(
      composeLegacyChapterHtml([{ id: "risks", label: "风险矩阵", html: "<p>R</p>" }]),
    ).toBe("<p>R</p>");
  });

  it("leaves chapters with no legacy source empty", () => {
    expect(
      resolveMappedChapterHtml(
        "financial-diligence",
        new Map([["snapshot", "<p>旧</p>"]]),
      ),
    ).toBe("");
  });
});
