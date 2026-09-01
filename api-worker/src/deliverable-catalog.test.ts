import { describe, expect, it } from "vitest";
import {
  deliverableDraftHtmlMarker,
  deliverableRelativePath,
  deliverablesForKind,
  deliverablesForKnSection,
  draftGenerateItemIds,
  earlierDeliverables,
  isDeliverableDraftHtml,
  orderDeliverableDraftIds,
  unpublishedGenerateItemIds,
} from "./deliverable-catalog";
import { deliverableDraftId, fullDraftSectionIds } from "./kn-catalog";
import { skillPackForName } from "./skill-packs";

describe("deliverable-catalog", () => {
  it("keeps unique file ids and paths within each kind", () => {
    for (const kind of ["early", "mature", "acquire"] as const) {
      const files = deliverablesForKind(kind);
      const ids = files.map((d) => d.id);
      const paths = files.map((d) => `${d.pack}/${d.folder}/${d.filename}`);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(paths).size).toBe(paths.length);
      expect(files.every((d) => d.filename.endsWith(".md"))).toBe(true);
      for (const d of files) {
        expect(skillPackForName(d.skill)).not.toBe("platform");
      }
    }
  });

  it("orders early files by discovery → strategy → product → finance → validation → overview", () => {
    const early = deliverablesForKind("early");
    const idx = (id: string) => early.findIndex((d) => d.id === id);
    expect(idx("market-analysis")).toBeLessThan(idx("research-gate"));
    expect(idx("research-gate")).toBeLessThan(idx("lean-canvas"));
    expect(idx("go-to-market")).toBeLessThan(idx("mvp-definition"));
    expect(idx("feature-prioritization")).toBeLessThan(idx("revenue-model"));
    expect(idx("projections")).toBeLessThan(idx("risk-analysis"));
    expect(idx("kill-criteria")).toBeLessThan(idx("scorecard"));
    expect(idx("scorecard")).toBeLessThan(idx("readme"));
    expect(early.at(-1)?.id).toBe("action-plan-30-days");
    expect(early.some((d) => d.id === "brand")).toBe(false);
  });

  it("puts file items before knowledge chapters, and overview last, on a full run", () => {
    for (const kind of ["early", "mature", "acquire"] as const) {
      const ids = draftGenerateItemIds(kind, "full");
      const files = deliverablesForKind(kind).map((d) =>
        deliverableDraftId(d.id),
      );
      expect(ids.slice(0, files.length)).toEqual(files);
      expect(ids.at(-1)).toBe("project-overview");
    }
    const early = draftGenerateItemIds("early", "full");
    expect(early).toHaveLength(
      deliverablesForKind("early").length + fullDraftSectionIds("early").length,
    );
    expect(early.indexOf(deliverableDraftId("market-analysis"))).toBeLessThan(
      early.indexOf("market-analysis"),
    );
    expect(early.indexOf(deliverableDraftId("readme"))).toBeLessThan(
      early.indexOf("exec-summary"),
    );
  });

  it("includes only the matching files for a single chapter", () => {
    expect(draftGenerateItemIds("early", "section", "market-analysis")).toEqual(
      [deliverableDraftId("market-analysis"), "market-analysis"],
    );
    expect(draftGenerateItemIds("early", "section", "brand")).toEqual(["brand"]);
    expect(draftGenerateItemIds("early", "section", "project-overview")).toEqual(
      ["project-overview"],
    );
    expect(
      deliverablesForKnSection("early", "lean-business-model").map((d) => d.id),
    ).toEqual(["lean-canvas", "business-model"]);
    expect(draftGenerateItemIds("mature", "section", "company-team")).toEqual([
      deliverableDraftId("background-check"),
      deliverableDraftId("compliance-check"),
      "company-team",
    ]);
  });

  it("adds earlier-phase files as context predecessors", () => {
    const lean = deliverablesForKind("early").find((d) => d.id === "lean-canvas");
    expect(lean).toBeTruthy();
    const earlier = earlierDeliverables("early", lean!);
    expect(earlier.map((d) => d.id)).toContain("market-analysis");
    expect(earlier.map((d) => d.id)).not.toContain("mvp-definition");
  });

  it("only requeues files that belong to unpublished knowledge chapters", () => {
    expect(
      unpublishedGenerateItemIds("early", [
        "market-analysis",
        "project-overview",
      ]),
    ).toEqual([
      deliverableDraftId("market-analysis"),
      "market-analysis",
      "project-overview",
    ]);
  });

  it("keeps deliverable draft html as a path marker, not chapter HTML", () => {
    const file = deliverablesForKind("early")[0]!;
    const marker = deliverableDraftHtmlMarker(file);
    expect(marker).toBe(
      `file:${deliverableRelativePath(file)}/${file.filename}`,
    );
    expect(isDeliverableDraftHtml(marker)).toBe(true);
    expect(isDeliverableDraftHtml('<div class="kn-callout">x</div>')).toBe(
      false,
    );
  });

  it("orders pending file ids by catalog phase", () => {
    expect(
      orderDeliverableDraftIds("early", [
        deliverableDraftId("projections"),
        deliverableDraftId("market-analysis"),
      ]),
    ).toEqual([
      deliverableDraftId("market-analysis"),
      deliverableDraftId("projections"),
    ]);
  });
});
