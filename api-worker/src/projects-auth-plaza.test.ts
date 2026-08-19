import { describe, expect, it } from "vitest";
import { membershipsAllowPlazaDiscovery } from "./plaza-discovery";

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
    expect(membershipsAllowPlazaDiscovery(["issuer", "guest"])).toBe(false);
  });

  it("allows plaza for investment-team accounts even with only issuer memberships", () => {
    expect(membershipsAllowPlazaDiscovery(["issuer"], "low")).toBe(true);
    expect(membershipsAllowPlazaDiscovery(["issuer"], "core")).toBe(true);
    expect(membershipsAllowPlazaDiscovery(["issuer"], "admin")).toBe(true);
  });

  it("hides plaza when the account default identity is issuer", () => {
    expect(membershipsAllowPlazaDiscovery([], "issuer")).toBe(false);
    expect(membershipsAllowPlazaDiscovery(["core"], "issuer")).toBe(false);
  });
});
