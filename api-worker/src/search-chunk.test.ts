import { describe, expect, it } from "vitest";
import { chunkPlainText } from "./search";

describe("chunkPlainText", () => {
  it("caps chunk count so huge markdown does not explode", () => {
    const text = "a".repeat(900 * 200);
    expect(chunkPlainText(text).length).toBe(120);
    expect(chunkPlainText(text, 900, 10).length).toBe(10);
  });
});
