import { describe, expect, it } from "vitest";
import { roleWithCreatorFloor } from "./workspace-roles";

describe("roleWithCreatorFloor", () => {
  it("gives the project creator Admin, not Core", () => {
    expect(roleWithCreatorFloor("u1", "u1", null)).toBe("admin");
    expect(roleWithCreatorFloor("u1", "u1", "core")).toBe("admin");
    expect(roleWithCreatorFloor("u1", "u1", "low")).toBe("admin");
  });

  it("does not promote non-creators", () => {
    expect(roleWithCreatorFloor("u2", "u1", null)).toBe("guest");
    expect(roleWithCreatorFloor("u2", "u1", "core")).toBe("core");
  });
});
