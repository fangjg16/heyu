import assert from "node:assert/strict";
import { rasterizePdfPage, rasterizePdfPages } from "./pdf-pages-png.mjs";

/** 最小可渲染单页 PDF（Helvetia 标准字） */
function tinyPdf() {
  const lines = [
    "%PDF-1.1",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>endobj",
    "4 0 obj<</Length 51>>stream",
    "BT /F1 18 Tf 40 100 Td (Stone Island) Tj ET",
    "endstream",
    "endobj",
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
  ];
  return Buffer.from(lines.join("\n"), "latin1");
}

const { pages, totalPages } = await rasterizePdfPages(tinyPdf(), {
  fileName: "测绘图.pdf",
  maxPages: 2,
  width: 400,
});
assert.equal(totalPages, 1);
assert.equal(pages.length, 1);
assert.match(pages[0].dataUrl, /^data:image\/png;base64,/);
assert.equal(pages[0].label, "测绘图.pdf");
assert.ok(pages[0].dataUrl.length > 80);

const one = await rasterizePdfPage(tinyPdf(), { page: 1, width: 400 });
assert.equal(one.page, 1);
assert.equal(one.totalPages, 1);
assert.match(one.dataUrl, /^data:image\/png;base64,/);
assert.ok(one.dataUrl.length > 80);

console.log("pdf-pages-png: ok");
