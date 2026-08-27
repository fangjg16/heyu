import * as XLSX from "xlsx";
import { oleMagic, zipMagic } from "./file-mime";
import { unzipToEntries } from "./zip-inflate";

const MAX_OFFICE_CHARS = 200_000;

export type OfficeExtractResult = {
  text: string;
  parsed: boolean;
  warning?: string;
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/giu, (_, h: string) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    })
    .replace(/&#(\d+);/gu, (_, n: string) => {
      const v = Number(n);
      return Number.isFinite(v) ? String.fromCodePoint(v) : "";
    })
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'");
}

/** 从 WordprocessingML 抽出可见文字（w:t / w:instrText） */
export function wordXmlToPlain(xml: string): string {
  const withBreaks = xml
    .replace(/<w:tab\b[^>]*\/?>/giu, "\t")
    .replace(/<w:br\b[^>]*\/?>/giu, "\n")
    .replace(/<w:cr\b[^>]*\/?>/giu, "\n")
    .replace(/<\/w:p>/giu, "\n");
  const texts: string[] = [];
  const re = /<w:(?:t|instrText)\b[^>]*>([\s\S]*?)<\/w:(?:t|instrText)>/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withBreaks))) {
    texts.push(decodeXmlEntities(m[1] ?? ""));
  }
  if (texts.length === 0) {
    return decodeXmlEntities(withBreaks.replace(/<[^>]+>/gu, " "))
      .replace(/[ \t]+\n/gu, "\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trim();
  }
  return texts
    .join("")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function cap(text: string, warning?: string): OfficeExtractResult {
  let body = text.trim();
  if (!body) {
    return { text: "", parsed: false, warning: warning || "文档中没有可提取的文字。" };
  }
  let note = warning;
  if (body.length > MAX_OFFICE_CHARS) {
    body = body.slice(0, MAX_OFFICE_CHARS);
    note = [note, `正文过长，仅保留前 ${MAX_OFFICE_CHARS} 字供检索。`].filter(Boolean).join(" ");
  }
  return { text: body, parsed: true, warning: note };
}

export async function extractDocxPlainText(
  data: ArrayBuffer | Uint8Array,
  filename: string,
): Promise<OfficeExtractResult> {
  try {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!zipMagic(bytes) && bytes.byteLength > 4) {
      return {
        text: "",
        parsed: false,
        warning: `${filename} 不是有效的 DOCX（ZIP）文件。`,
      };
    }
    const entries = await unzipToEntries(bytes);
    const parts: string[] = [];
    const names = Object.keys(entries).sort((a, b) => a.localeCompare(b));
    const xmlNames = names.filter((n) => {
      const p = n.replace(/\\/gu, "/").toLowerCase();
      return (
        p === "word/document.xml" ||
        /^word\/header\d*\.xml$/u.test(p) ||
        /^word\/footer\d*\.xml$/u.test(p) ||
        p === "word/footnotes.xml" ||
        p === "word/endnotes.xml" ||
        p === "word/comments.xml"
      );
    });
    if (!xmlNames.some((n) => n.replace(/\\/gu, "/").toLowerCase() === "word/document.xml")) {
      return {
        text: "",
        parsed: false,
        warning: `${filename} 缺少 word/document.xml，可能已损坏。`,
      };
    }
    for (const name of xmlNames) {
      const xml = new TextDecoder("utf-8").decode(entries[name]);
      const plain = wordXmlToPlain(xml);
      if (!plain) continue;
      const label = name.replace(/\\/gu, "/");
      if (label.toLowerCase() === "word/document.xml") {
        parts.push(plain);
      } else {
        parts.push(`【${label}】\n${plain}`);
      }
    }
    const header = `【${filename} · Word 提取正文】\n`;
    return cap(header + parts.join("\n\n"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: "", parsed: false, warning: `DOCX 解析失败：${msg}` };
  }
}

function asUint8(content: unknown): Uint8Array {
  if (content instanceof Uint8Array) return content;
  if (Array.isArray(content)) return Uint8Array.from(content as number[]);
  if (content && typeof content === "object" && "length" in (content as object)) {
    return Uint8Array.from(content as ArrayLike<number>);
  }
  return new Uint8Array();
}

function readU16(data: Uint8Array, off: number): number {
  if (off + 1 >= data.byteLength) return 0;
  return data[off]! | (data[off + 1]! << 8);
}

function readU32(data: Uint8Array, off: number): number {
  if (off + 3 >= data.byteLength) return 0;
  return (
    (data[off]! |
      (data[off + 1]! << 8) |
      (data[off + 2]! << 16) |
      (data[off + 3]! << 24)) >>>
    0
  );
}

function decodeUtf16Le(data: Uint8Array): string {
  try {
    return new TextDecoder("utf-16le").decode(data);
  } catch {
    let s = "";
    for (let i = 0; i + 1 < data.byteLength; i += 2) {
      s += String.fromCharCode(data[i]! | (data[i + 1]! << 8));
    }
    return s;
  }
}

function looksMostlyUtf16Le(data: Uint8Array): boolean {
  if (data.byteLength < 8) return false;
  let zeros = 0;
  const n = Math.min(data.byteLength, 400);
  for (let i = 1; i < n; i += 2) {
    if (data[i] === 0) zeros += 1;
  }
  return zeros / Math.floor(n / 2) > 0.3;
}

function cleanWordText(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, "")
    .replace(/\r\n/gu, "\n")
    .replace(/\r/gu, "\n")
    .replace(/\u0007/gu, "\t")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function fromUtf16Codes(codes: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < codes.length; i += 1024) {
    parts.push(String.fromCharCode(...codes.slice(i, i + 1024)));
  }
  return parts.join("");
}

function harvestUtf16Runs(data: Uint8Array, minChars = 12): string {
  const chunks: string[] = [];
  let i = 0;
  while (i + 1 < data.byteLength) {
    const codes: number[] = [];
    let j = i;
    while (j + 1 < data.byteLength) {
      const c = data[j]! | (data[j + 1]! << 8);
      const ok =
        c === 0x0a ||
        c === 0x0d ||
        c === 0x09 ||
        (c >= 0x20 && c <= 0xff) ||
        (c >= 0x100 && c <= 0xd7ff) ||
        (c >= 0xe000 && c <= 0xfffd);
      if (!ok) break;
      codes.push(c);
      j += 2;
    }
    if (codes.length >= minChars) {
      chunks.push(fromUtf16Codes(codes));
      i = j;
    } else {
      i += 1;
    }
  }
  return cleanWordText(chunks.join("\n"));
}

/** 极简 RTF：去掉控制字，保留可见正文 */
export function extractRtfPlain(rtf: string): string {
  let s = rtf;
  s = s.replace(/\{\\\*/gu, "{");
  s = s.replace(/\\'[0-9a-fA-F]{2}/gu, (m) => {
    const n = parseInt(m.slice(2), 16);
    return Number.isFinite(n) ? String.fromCharCode(n) : "";
  });
  s = s.replace(/\\u(-?\d+)\??/gu, (_, n: string) => {
    let v = Number(n);
    if (v < 0) v += 65536;
    return Number.isFinite(v) && v > 0 ? String.fromCharCode(v) : "";
  });
  s = s.replace(/\\par[d]?/gu, "\n");
  s = s.replace(/\\tab/gu, "\t");
  s = s.replace(/\\line/gu, "\n");
  s = s.replace(/\\[a-z]+-?\d* ?/giu, "");
  s = s.replace(/[{}]/gu, "");
  return cleanWordText(s);
}

function extractFromWordDocumentStream(stream: Uint8Array): {
  text: string;
  warning?: string;
} {
  if (stream.byteLength < 32) {
    return { text: "", warning: "WordDocument 流过短。" };
  }
  const wIdent = readU16(stream, 0);
  if (wIdent !== 0xa5ec && wIdent !== 0xa5dc) {
    const harvested = harvestUtf16Runs(stream);
    return harvested ? { text: harvested } : { text: "", warning: "不是可识别的 Word 97 文档流。" };
  }
  const flags = readU16(stream, 10);
  const encrypted = Boolean(flags & 0x100) || Boolean(flags & 0x8000);
  if (encrypted) {
    return { text: "", warning: "该 DOC 已加密，无法提取正文。请在 Word 中解密后另存为 DOCX。" };
  }
  const fExtChar = Boolean(flags & 0x1000);
  const fcMin = readU32(stream, 24);
  const fcMac = readU32(stream, 28);
  const start = Math.min(fcMin, stream.byteLength);
  const end = Math.min(Math.max(fcMac, start), stream.byteLength);
  let slice = start < end ? stream.subarray(start, end) : new Uint8Array();
  let text = "";
  if (slice.byteLength > 0) {
    if (fExtChar || looksMostlyUtf16Le(slice)) {
      text = cleanWordText(decodeUtf16Le(slice));
    } else {
      text = cleanWordText(new TextDecoder("latin1").decode(slice));
    }
  }
  const harvested = harvestUtf16Runs(stream);
  if (harvested && harvested.length > text.length * 1.2) {
    text = harvested;
  } else if (!text && harvested) {
    text = harvested;
  }
  return { text };
}

export async function extractDocPlainText(
  data: ArrayBuffer | Uint8Array,
  filename: string,
): Promise<OfficeExtractResult> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(256, bytes.byteLength)));
  if (head.startsWith("{\\rtf")) {
    const plain = extractRtfPlain(new TextDecoder("latin1").decode(bytes));
    const header = `【${filename} · RTF 提取正文】\n`;
    return cap(header + plain);
  }
  if (zipMagic(bytes)) {
    return extractDocxPlainText(bytes, filename);
  }
  if (!oleMagic(bytes)) {
    return {
      text: "",
      parsed: false,
      warning: `${filename} 不是 Word 97–2003 DOC（OLE）。请另存为 .docx 后上传。`,
    };
  }
  try {
    const cfb = XLSX.CFB.read(bytes, { type: "array" });
    const wordXml = XLSX.CFB.find(cfb, "word/document.xml");
    if (wordXml?.content) {
      const xml = new TextDecoder("utf-8").decode(asUint8(wordXml.content));
      return cap(`【${filename} · Word 提取正文】\n` + wordXmlToPlain(xml));
    }
    const wd = XLSX.CFB.find(cfb, "WordDocument") || XLSX.CFB.find(cfb, "/WordDocument");
    if (!wd?.content) {
      return {
        text: "",
        parsed: false,
        warning: `${filename} 中找不到 WordDocument 流。请用 Word 另存为 .docx。`,
      };
    }
    const extracted = extractFromWordDocumentStream(asUint8(wd.content));
    if (!extracted.text) {
      return {
        text: "",
        parsed: false,
        warning:
          extracted.warning ||
          `${filename} 未能抽出 Word 正文（复杂/损坏的 .doc）。请另存为 .docx 后重新上传。`,
      };
    }
    const header = `【${filename} · Word 提取正文】\n`;
    return cap(header + extracted.text, extracted.warning);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      text: "",
      parsed: false,
      warning: `DOC 解析失败：${msg}。请另存为 .docx 后重新上传。`,
    };
  }
}
