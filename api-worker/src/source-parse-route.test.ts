import { describe, expect, it } from "vitest";
import {
  classifySourceParseRoute,
  looksLikePlanOrMapFileName,
  pdfExtractLooksSparse,
} from "./source-parse-route";

describe("looksLikePlanOrMapFileName", () => {
  it("recognizes survey / master-plan / aerial names", () => {
    expect(looksLikePlanOrMapFileName("02_大陆地块测绘图_SP265790.pdf")).toBe(true);
    expect(
      looksLikePlanOrMapFileName("04 岛屿总体规划图_StoneIsland Master Plan.jpg"),
    ).toBe(true);
    expect(looksLikePlanOrMapFileName("08_岛屿可开发区域航拍标注图.pdf")).toBe(true);
    expect(looksLikePlanOrMapFileName("site plan.pdf")).toBe(true);
  });

  it("does not treat ordinary contracts as drawings", () => {
    expect(looksLikePlanOrMapFileName("股权转让协议.pdf")).toBe(false);
    expect(looksLikePlanOrMapFileName("01_岛屿权属_Title Search_2024.pdf")).toBe(
      false,
    );
  });
});

describe("classifySourceParseRoute", () => {
  it("sends native images to vision, never the PDF raster path", () => {
    expect(
      classifySourceParseRoute({
        fileName: "04 岛屿总体规划图_StoneIsland Master Plan.jpg",
        mime: "image/jpeg",
      }),
    ).toBe("image-vl");
  });

  it("keeps copyable PDF / Word / email on the text model", () => {
    expect(
      classifySourceParseRoute({
        fileName: "股权转让协议.pdf",
        mime: "application/pdf",
        pageCount: 12,
        extractedCharCount: 400 * 12 + 20,
      }),
    ).toBe("text");
    expect(
      classifySourceParseRoute({
        fileName: "纪要.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("text");
    expect(classifySourceParseRoute({ fileName: "往来.eml" })).toBe("text");
  });

  it("uses page-raster vision for few-page or named drawing PDFs", () => {
    expect(
      classifySourceParseRoute({
        fileName: "02_大陆地块测绘图_SP265790.pdf",
        mime: "application/pdf",
        pageCount: 2,
        extractedCharCount: 12,
      }),
    ).toBe("pdf-vl");
    expect(
      classifySourceParseRoute({
        fileName: "scan.pdf",
        mime: "application/pdf",
        pageCount: 3,
        extractedCharCount: 0,
      }),
    ).toBe("pdf-vl");
  });

  it("OCRs many-page text scans instead of rasterizing every page", () => {
    expect(
      classifySourceParseRoute({
        fileName: "扫描合同.pdf",
        mime: "application/pdf",
        pageCount: 48,
        extractedCharCount: 0,
      }),
    ).toBe("pdf-ocr");
    expect(
      classifySourceParseRoute({
        fileName: "扫描合同.pdf",
        mime: "application/pdf",
        pageCount: 50,
        extractedCharCount: 0,
      }),
    ).toBe("pdf-ocr");
  });
});

describe("pdfExtractLooksSparse", () => {
  it("treats a short survey-map text layer as sparse", () => {
    expect(
      pdfExtractLooksSparse("【测绘图.pdf · PDF 提取正文】\nSP265790 Stone Island", 2),
    ).toBe(true);
  });
});
