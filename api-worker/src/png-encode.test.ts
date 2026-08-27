import { describe, expect, it } from "vitest";
import { encodePngRgba } from "./png-encode";

describe("encodePngRgba", () => {
  it("writes a PNG signature for RGBA pixels", async () => {
    const png = await encodePngRgba(1, 1, new Uint8Array([255, 0, 0, 255]), 4);
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.byteLength).toBeGreaterThan(8);
  });

  it("accepts Uint8ClampedArray from pdf.js extractImages", async () => {
    const png = await encodePngRgba(
      1,
      1,
      new Uint8ClampedArray([10, 20, 30]),
      3,
    );
    expect(png[0]).toBe(137);
  });
});
