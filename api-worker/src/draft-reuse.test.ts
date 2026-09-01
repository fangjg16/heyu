import { describe, expect, it } from "vitest";
import {
  draftReuseShouldRetryFailed,
  unpublishedDraftSectionIds,
} from "./draft-reuse";

describe("draftReuseShouldRetryFailed", () => {
  it("retries failed chapters when the unused draft is already ready", () => {
    expect(
      draftReuseShouldRetryFailed("ready", [
        { status: "ok" },
        { status: "failed" },
      ]),
    ).toBe(true);
  });

  it("does not restart when every chapter is already ok", () => {
    expect(
      draftReuseShouldRetryFailed("ready", [{ status: "ok" }, { status: "ok" }]),
    ).toBe(false);
  });

  it("retries while the run is still generating", () => {
    expect(
      draftReuseShouldRetryFailed("generating", [{ status: "pending" }]),
    ).toBe(true);
  });
});

describe("unpublishedDraftSectionIds", () => {
  const ids = ["snapshot", "objectives", "industry"];

  it("treats chapters missing from live as unpublished", () => {
    const items = [
      { sectionId: "snapshot", status: "ok", html: "<p>a</p>" },
      { sectionId: "objectives", status: "ok", html: "<p>b</p>" },
      { sectionId: "industry", status: "ok", html: "<p>c</p>" },
    ];
    const live = new Map([["snapshot", "<p>a</p>"]]);
    expect(unpublishedDraftSectionIds(ids, items, live)).toEqual([
      "objectives",
      "industry",
    ]);
  });

  it("skips chapters whose draft still matches live", () => {
    const items = [
      { sectionId: "snapshot", status: "ok", html: "<p>a</p>" },
      { sectionId: "objectives", status: "ok", html: "<p>new</p>" },
    ];
    const live = new Map([
      ["snapshot", "<p>a</p>"],
      ["objectives", "<p>old</p>"],
    ]);
    expect(unpublishedDraftSectionIds(ids, items, live)).toEqual([
      "objectives",
      "industry",
    ]);
  });

  it("includes failed or pending even if live exists", () => {
    const items = [
      { sectionId: "snapshot", status: "failed", html: "<p>a</p>" },
      { sectionId: "objectives", status: "pending", html: "" },
    ];
    const live = new Map([["snapshot", "<p>a</p>"]]);
    expect(unpublishedDraftSectionIds(ids, items, live)).toEqual([
      "snapshot",
      "objectives",
      "industry",
    ]);
  });

  it("does not treat mapped old 13-grid html as published on the new catalog id", () => {
    const newIds = ["project-summary", "industry-competition"];
    const items = [
      { sectionId: "project-summary", status: "ok", html: "<p>草案概况</p>" },
      {
        sectionId: "industry-competition",
        status: "ok",
        html: "<p>草案行业</p>",
      },
    ];
    const live = new Map([["snapshot", "<p>旧快照</p>"]]);
    expect(unpublishedDraftSectionIds(newIds, items, live)).toEqual([
      "project-summary",
      "industry-competition",
    ]);
  });
});
