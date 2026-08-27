import assert from "node:assert/strict";
import {
  classifySourceParseRoute,
  looksLikePlanOrMapFileName,
  pdfExtractLooksSparse,
} from "../src/source-parse-route.ts";

assert.equal(looksLikePlanOrMapFileName("02_大陆地块测绘图_SP265790.pdf"), true);
assert.equal(
  looksLikePlanOrMapFileName("04 岛屿总体规划图_StoneIsland Master Plan.jpg"),
  true,
);
assert.equal(looksLikePlanOrMapFileName("08_岛屿可开发区域航拍标注图.pdf"), true);
assert.equal(looksLikePlanOrMapFileName("site plan.pdf"), true);
assert.equal(looksLikePlanOrMapFileName("股权转让协议.pdf"), false);
assert.equal(looksLikePlanOrMapFileName("01_岛屿权属_Title Search_2024.pdf"), false);

assert.equal(
  classifySourceParseRoute({
    fileName: "04 岛屿总体规划图_StoneIsland Master Plan.jpg",
    mime: "image/jpeg",
  }),
  "image-vl",
);

assert.equal(
  classifySourceParseRoute({
    fileName: "股权转让协议.pdf",
    mime: "application/pdf",
    pageCount: 12,
    extractedCharCount: 400 * 12 + 20,
  }),
  "text",
);
assert.equal(classifySourceParseRoute({ fileName: "纪要.docx" }), "text");
assert.equal(classifySourceParseRoute({ fileName: "往来.eml" }), "text");

assert.equal(
  classifySourceParseRoute({
    fileName: "02_大陆地块测绘图_SP265790.pdf",
    mime: "application/pdf",
    pageCount: 2,
    extractedCharCount: 12,
  }),
  "pdf-vl",
);
assert.equal(
  classifySourceParseRoute({
    fileName: "scan.pdf",
    mime: "application/pdf",
    pageCount: 3,
    extractedCharCount: 0,
  }),
  "pdf-vl",
);
assert.equal(
  classifySourceParseRoute({
    fileName: "扫描合同.pdf",
    mime: "application/pdf",
    pageCount: 48,
    extractedCharCount: 0,
  }),
  "pdf-ocr",
);

assert.equal(
  pdfExtractLooksSparse("【测绘图.pdf · PDF 提取正文】\nSP265790 Stone Island", 2),
  true,
);

console.log("source-parse-route: ok");
