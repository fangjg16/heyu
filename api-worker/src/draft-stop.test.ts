import { describe, expect, it } from "vitest";
import { stoppedDraftItemStatus } from "./draft-stop";

describe("stoppedDraftItemStatus", () => {
  it("keeps finished chapters untouched", () => {
    expect(
      stoppedDraftItemStatus({ status: "ok", html: "<p>已有</p>" }),
    ).toBeNull();
    expect(
      stoppedDraftItemStatus({ status: "failed", html: null }),
    ).toBeNull();
  });

  it("keeps pending chapters that already have html", () => {
    expect(
      stoppedDraftItemStatus({ status: "pending", html: "<h1>章</h1>" }),
    ).toEqual({ status: "ok", error: null });
  });

  it("marks empty pending chapters as stopped, not discarded", () => {
    expect(stoppedDraftItemStatus({ status: "pending", html: null })).toEqual({
      status: "failed",
      error: "已停止生成",
    });
    expect(stoppedDraftItemStatus({ status: "revising", html: "  " })).toEqual({
      status: "failed",
      error: "已停止生成",
    });
  });
});
