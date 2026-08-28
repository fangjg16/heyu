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
});
