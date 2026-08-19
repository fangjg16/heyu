import { describe, expect, it } from "vitest";
import { membershipsAllowPlazaDiscovery } from "./plaza-discovery";

describe("membershipsAllowPlazaDiscovery", () => {
  it("allows plaza for logged-in accounts regardless of project identity", () => {
    expect(membershipsAllowPlazaDiscovery([])).toBe(true);
    expect(membershipsAllowPlazaDiscovery(["issuer"])).toBe(true);
  });
});
