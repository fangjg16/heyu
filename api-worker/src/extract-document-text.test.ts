import { describe, expect, it } from "vitest";
import {
  extractDocumentText,
  looksLikeUnparsedPlaceholder,
  ocrPendingPlaceholder,
} from "./extract-document-text";
import { extractDocxPlainText, wordXmlToPlain } from "./office-text";
import { unzipToEntries } from "./zip-inflate";

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function makeStoredZip(entries: Record<string, Uint8Array | string>): Uint8Array {
  const files = Object.entries(entries).map(([name, data]) => ({
    name,
    data: typeof data === "string" ? new TextEncoder().encode(data) : data,
  }));
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = new TextEncoder().encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + nameBytes.length + f.data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, f.data.length, true);
    view.setUint32(22, f.data.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(f.data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let p = 0;
  for (const l of locals) {
    out.set(l, p);
    p += l.length;
  }
  for (const c of centrals) {
    out.set(c, p);
    p += c.length;
  }
  out.set(eocd, p);
  return out;
}

const DOCX_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>合域尽调备忘录</w:t></w:r></w:p>
    <w:p><w:r><w:t>收入 1200 万</w:t></w:r></w:p>
  </w:body>
</w:document>`;

describe("wordXmlToPlain", () => {
  it("extracts w:t runs and paragraph breaks", () => {
    expect(wordXmlToPlain(DOCX_XML)).toContain("合域尽调备忘录");
    expect(wordXmlToPlain(DOCX_XML)).toContain("收入 1200 万");
  });
});

describe("unzipToEntries stored zip", () => {
  it("round-trips a stored zip", async () => {
    const zip = makeStoredZip({ "a/hello.txt": "hello-zip" });
    const entries = await unzipToEntries(zip);
    expect(new TextDecoder().decode(entries["a/hello.txt"])).toBe("hello-zip");
  });
});

describe("extractDocxPlainText", () => {
  it("reads word/document.xml from a minimal docx zip", async () => {
    const zip = makeStoredZip({ "word/document.xml": DOCX_XML });
    const extracted = await extractDocxPlainText(zip, "memo.docx");
    expect(extracted.parsed).toBe(true);
    expect(extracted.text).toContain("合域尽调备忘录");
    expect(extracted.text).toContain("收入 1200 万");
  });
});

describe("extractDocumentText", () => {
  it("decodes plain text", async () => {
    const r = await extractDocumentText({
      bytes: new TextEncoder().encode("alpha"),
      fileName: "n.txt",
      mimeType: "text/plain",
    });
    expect(r.parsed).toBe(true);
    expect(r.text).toContain("alpha");
    expect(r.needsOcr).toBe(false);
  });

  it("extracts docx via the dispatcher", async () => {
    const zip = makeStoredZip({ "word/document.xml": DOCX_XML });
    const r = await extractDocumentText({
      bytes: zip,
      fileName: "memo.docx",
    });
    expect(r.parsed).toBe(true);
    expect(r.text).toContain("合域尽调备忘录");
  });

  it("concatenates zip members and recurses one nested zip", async () => {
    const inner = makeStoredZip({ "inner.txt": "NESTED-OK" });
    const outer = makeStoredZip({
      "readme.txt": "OUTER-OK",
      "pack.zip": inner,
    });
    const r = await extractDocumentText({
      bytes: outer,
      fileName: "bundle.zip",
    });
    expect(r.text).toContain("OUTER-OK");
    expect(r.text).toContain("NESTED-OK");
  });

  it("marks images as OCR-pending without calling the API", async () => {
    let called = 0;
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const r = await extractDocumentText({
      bytes: png,
      fileName: "scan.png",
      mimeType: "image/png",
      allowOcr: false,
      fetchImpl: (async () => {
        called += 1;
        return new Response("{}");
      }) as typeof fetch,
    });
    expect(called).toBe(0);
    expect(r.needsOcr).toBe(true);
    expect(r.text).toContain("等待 OCR");
    expect(looksLikeUnparsedPlaceholder(r.text)).toBe(true);
  });

  it("OCRs images when allowOcr is set, via chat/completions", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const urls: string[] = [];
    const r = await extractDocumentText({
      bytes: png,
      fileName: "scan.png",
      mimeType: "image/png",
      allowOcr: true,
      env: {
        DASHSCOPE_API_KEY: "sk-test",
        DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
      fetchImpl: (async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "规划图文字：滨海区" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as typeof fetch,
    });
    expect(urls.some((u) => u.endsWith("/chat/completions"))).toBe(true);
    expect(r.parsed).toBe(true);
    expect(r.needsOcr).toBe(false);
    expect(r.text).toContain("滨海区");
    expect(looksLikeUnparsedPlaceholder(r.text)).toBe(false);
  });

  it("does not treat OCR failure as a retryable placeholder", () => {
    const failed = "（图片「a.png」OCR 未抽出文字。请压缩后重新上传。）";
    expect(looksLikeUnparsedPlaceholder(failed)).toBe(false);
    expect(looksLikeUnparsedPlaceholder(ocrPendingPlaceholder("pdf", "a.pdf"))).toBe(
      true,
    );
  });

  it("treats pre-OCR scan PDF placeholders as needing OCR", () => {
    const old = "（已上传 PDF：02_大陆地块测绘图_SP265790.pdf。未能从 PDF 提取文字（多为扫描件/图片版）。请上传可复制文字的 PDF，或另附 .txt/.md。）";
    expect(looksLikeUnparsedPlaceholder(old)).toBe(true);
    expect(
      looksLikeUnparsedPlaceholder(
        "（扫描 PDF「02.pdf」OCR 未抽出文字。模型未返回文字。）",
      ),
    ).toBe(false);
  });
});
