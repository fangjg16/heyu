import { describe, expect, it } from "vitest";
import {
  isReadOnlyVolumeError,
  skillNamesMissingFromVolume,
} from "./skills-prune";

describe("skillNamesMissingFromVolume", () => {
  it("returns db names that are not on the volume", () => {
    expect(
      skillNamesMissingFromVolume(
        [
          "deal-screening",
          "acquisition-intake",
          "startup-design",
          "target-screening",
        ],
        ["deal-screening", "startup-design"],
      ),
    ).toEqual(["acquisition-intake", "target-screening"]);
  });

  it("returns nothing when volume still has every db skill", () => {
    expect(
      skillNamesMissingFromVolume(["deal-screening"], ["deal-screening"]),
    ).toEqual([]);
  });
});

describe("isReadOnlyVolumeError", () => {
  it("matches ECS bind-mount failures", () => {
    expect(
      isReadOnlyVolumeError(
        "EROFS: read-only file system, rmdir '/hermes-railway/skills/deal-screening'",
      ),
    ).toBe(true);
    expect(
      isReadOnlyVolumeError(
        "ENOENT: no such file or directory, mkdir '/hermes-railway/skills/acquisition-intake'",
      ),
    ).toBe(true);
    expect(isReadOnlyVolumeError("找不到 skill：foo")).toBe(false);
  });
});
