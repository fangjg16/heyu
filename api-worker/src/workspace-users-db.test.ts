import { describe, expect, it } from "vitest";
import {
  normalizeDisplayNameKey,
  normalizeUsername,
  uniqueRowId,
} from "./workspace-users-db";

describe("normalizeUsername", () => {
  it("strips spaces and lowercases so display-like input still hits login name", () => {
    expect(normalizeUsername("Narrative Forge")).toBe("narrativeforge");
    expect(normalizeUsername("JaniceHi")).toBe("janicehi");
    expect(normalizeUsername(" Maxeast ")).toBe("maxeast");
  });
});

describe("normalizeDisplayNameKey", () => {
  it("keeps inner spaces so unique display names can be matched", () => {
    expect(normalizeDisplayNameKey(" Narrative Forge ")).toBe("narrative forge");
    expect(normalizeDisplayNameKey("JaniceHi")).toBe("janicehi");
  });
});

describe("uniqueRowId", () => {
  it("returns the only id", () => {
    expect(uniqueRowId([{ id: "janicehi" }])).toBe("janicehi");
  });

  it("returns null when missing or ambiguous", () => {
    expect(uniqueRowId([])).toBeNull();
    expect(uniqueRowId([{ id: "a" }, { id: "b" }])).toBeNull();
    expect(uniqueRowId([{ id: "  " }])).toBeNull();
  });
});
