import { describe, expect, it } from "vitest";
import { parseApprovedJoinRole } from "./project-join-role";

describe("parseApprovedJoinRole", () => {
  it("defaults omitted or blank role to Basic", () => {
    expect(parseApprovedJoinRole(undefined)).toBe("low");
    expect(parseApprovedJoinRole(null)).toBe("low");
    expect(parseApprovedJoinRole("")).toBe("low");
    expect(parseApprovedJoinRole("  ")).toBe("low");
  });

  it("can default omitted role to Core for early projects", () => {
    expect(parseApprovedJoinRole(undefined, "core")).toBe("core");
    expect(parseApprovedJoinRole("", "core")).toBe("core");
  });

  it("accepts issuer and investor permission tiers", () => {
    expect(parseApprovedJoinRole("issuer")).toBe("issuer");
    expect(parseApprovedJoinRole("admin")).toBe("admin");
    expect(parseApprovedJoinRole("core")).toBe("core");
    expect(parseApprovedJoinRole("LOW")).toBe("low");
  });

  it("rejects guest / advanced / unknown as permission tiers", () => {
    expect(parseApprovedJoinRole("guest")).toBeNull();
    expect(parseApprovedJoinRole("mid")).toBeNull();
    expect(parseApprovedJoinRole("advanced")).toBeNull();
    expect(parseApprovedJoinRole("investor")).toBeNull();
  });
});
