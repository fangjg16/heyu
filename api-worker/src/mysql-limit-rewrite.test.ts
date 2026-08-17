import { describe, expect, it } from "vitest";
import { rewriteLimitOffsetPlaceholders } from "../scripts/mysql-limit-rewrite.mjs";

describe("rewriteLimitOffsetPlaceholders", () => {
  it("inlines trailing LIMIT ?", () => {
    const out = rewriteLimitOffsetPlaceholders(
      "SELECT id FROM t WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
      ["u1", 100],
    );
    expect(out.sql).toBe(
      "SELECT id FROM t WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
    );
    expect(out.params).toEqual(["u1"]);
  });

  it("inlines LIMIT ? OFFSET ?", () => {
    const out = rewriteLimitOffsetPlaceholders(
      "SELECT * FROM t LIMIT ? OFFSET ?",
      [20, 40],
    );
    expect(out.sql).toBe("SELECT * FROM t LIMIT 20 OFFSET 40");
    expect(out.params).toEqual([]);
  });

  it("leaves SQL without LIMIT ? unchanged", () => {
    const out = rewriteLimitOffsetPlaceholders("SELECT * FROM t WHERE id = ?", [
      "abc",
    ]);
    expect(out.sql).toBe("SELECT * FROM t WHERE id = ?");
    expect(out.params).toEqual(["abc"]);
  });
});
