import { describe, expect, it } from "vitest";
import { membershipsAllowPlazaDiscovery } from "./plaza-discovery";

describe("membershipsAllowPlazaDiscovery", () => {
  it("allows plaza by default for logged-in accounts", () => {
    expect(membershipsAllowPlazaDiscovery([])).toBe(true);
    expect(membershipsAllowPlazaDiscovery(["issuer"])).toBe(true);
    expect(membershipsAllowPlazaDiscovery(["issuer"], "guest")).toBe(true);
    expect(membershipsAllowPlazaDiscovery(["issuer"], "low")).toBe(true);
  });

  it("hides plaza only when the account default identity is issuer", () => {
    expect(membershipsAllowPlazaDiscovery([], "issuer")).toBe(false);
    expect(membershipsAllowPlazaDiscovery(["core"], "issuer")).toBe(false);
  });
});
