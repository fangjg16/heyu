import { describe, expect, it } from "vitest";
import { membershipsAllowPlazaDiscovery } from "./projects-auth";

describe("membershipsAllowPlazaDiscovery", () => {
  it("allows plaza when the user has no memberships yet", () => {
    expect(membershipsAllowPlazaDiscovery([])).toBe(true);
  });

  it("allows plaza for investor roles", () => {
    expect(membershipsAllowPlazaDiscovery(["admin"])).toBe(true);
    expect(membershipsAllowPlazaDiscovery(["issuer", "core"])).toBe(true);
  });

  it("hides plaza when every membership is issuer", () => {
    expect(membershipsAllowPlazaDiscovery(["issuer"])).toBe(false);
    expect(membershipsAllowPlazaDiscovery(["issuer", "issuer"])).toBe(false);
  });
});
