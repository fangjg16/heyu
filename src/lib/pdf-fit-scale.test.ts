import { describe, expect, it } from "vitest";
import { fitPdfScale, PDF_PAGE_GUTTER } from "./pdf-fit-scale";

describe("fitPdfScale", () => {
  it("fits a portrait page inside the box with gutter", () => {
    const scale = fitPdfScale(612, 792, 1200, 800);
    const drawnW = 612 * scale;
    const drawnH = 792 * scale;
    expect(drawnW).toBeLessThanOrEqual(1200 - PDF_PAGE_GUTTER * 2 + 0.01);
    expect(drawnH).toBeLessThanOrEqual(800 - PDF_PAGE_GUTTER * 2 + 0.01);
    expect(drawnH).toBeGreaterThan(700);
  });

  it("returns 1 when the box is not measured yet", () => {
    expect(fitPdfScale(612, 792, 0, 0)).toBe(1);
  });
});
