import { describe, expect, it } from "vitest";
import { draftReuseShouldRetryFailed } from "./draft-reuse";

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
