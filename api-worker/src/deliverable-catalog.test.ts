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
  headingSlicesForDeliverable,
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
        const pack = skillPackForName(d.skill);
        if (
          kind === "acquire" &&
          ["risk-matrix", "gap-tracking", "dd-claim-audit"].includes(d.skill)
        ) {
          continue;
        }
        expect(pack).not.toBe("platform");
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

  it("uses CapitalLens v3.2 folders and the two workstream skills", () => {
    const mature = deliverablesForKind("mature");
    expect(mature.find((d) => d.id === "brief")?.filename).toBe(
      "project-brief.md",
    );
    expect(mature.find((d) => d.id === "brief")?.folder).toBe("01-intake");
    expect(mature.some((d) => d.id === "screening-memo")).toBe(true);
    expect(mature.some((d) => d.id === "value-creation-plan")).toBe(false);
    expect(
      mature.every((d) =>
        ["deal-screening", "due-diligence"].includes(d.skill),
      ),
    ).toBe(true);
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
    expect(draftGenerateItemIds("mature", "section", "project-summary")).toEqual(
      ["project-summary"],
    );
    expect(draftGenerateItemIds("mature", "section", "company-team")).toEqual([
      deliverableDraftId("business-due-diligence"),
      "company-team",
    ]);
    expect(
      draftGenerateItemIds("mature", "section", "company-background"),
    ).toEqual([deliverableDraftId("background-check"), "company-background"]);
    expect(
      headingSlicesForDeliverable(
        deliverablesForKind("mature").find((d) => d.id === "industry-due-diligence")!,
        "industry-overview",
      ),
    ).toEqual([
      "行业定义与坐标",
      "市场现状、规模与增长",
      "发展历程与关键拐点",
    ]);
    expect(deliverablesForKnSection("mature", "sources")).toEqual([]);
    expect(deliverablesForKind("mature").some((d) => d.id === "source-register")).toBe(
      true,
    );
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
