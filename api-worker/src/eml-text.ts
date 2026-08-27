/**
 * RFC822 / .eml：抽出主题、正文（text/plain 优先），并展开附件字节。
 * 覆盖 quoted-printable、base64、常见 multipart；不依赖第三方 MIME 库。
 */

import { guessMimeFromFileName } from "./file-mime";

const MAX_EML_ATTACHMENTS = 30;
const MAX_ATTACHMENT_BYTES = 40_000_000;
const MAX_TEXT_CHARS = 200_000;
const MAX_PART_DEPTH = 8;

export type EmlAttachment = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type EmlExtractResult = {
  text: string;
  parsed: boolean;
  warning?: string;
  attachments: EmlAttachment[];
};

function latin1Decode(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

function bytesIndexOf(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  if (needle.byteLength === 0) return from;
  outer: for (let i = from; i <= hay.byteLength - needle.byteLength; i++) {
    for (let j = 0; j < needle.byteLength; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function splitHeadersAndBody(raw: Uint8Array): { headerText: string; body: Uint8Array } {
  const crlf = new Uint8Array([0x0d, 0x0a, 0x0d, 0x0a]);
  const lf = new Uint8Array([0x0a, 0x0a]);
  let idx = bytesIndexOf(raw, crlf);
  let sep = 4;
  if (idx < 0) {
    idx = bytesIndexOf(raw, lf);
    sep = 2;
  }
  if (idx < 0) {
    return { headerText: latin1Decode(raw), body: new Uint8Array() };
  }
  return {
    headerText: latin1Decode(raw.subarray(0, idx)),
    body: raw.subarray(idx + sep),
  };
}

function unfoldHeaders(headerText: string): Record<string, string> {
  const lines = headerText.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n").split("\n");
  const joined: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/u.test(line) && joined.length > 0) {
      joined[joined.length - 1] += " " + line.trim();
    } else if (line.trim()) {
      joined.push(line);
    }
  }
  const out: Record<string, string> = {};
  for (const line of joined) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!key) continue;
    out[key] = out[key] ? `${out[key]} ${value}` : value;
  }
  return out;
}

function decodeQuotedPrintable(input: string): Uint8Array {
  const soft = input.replace(/=\r?\n/gu, "");
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    const ch = soft[i];
    if (ch === "=" && i + 2 < soft.length) {
      const hex = soft.slice(i + 1, i + 3);
      if (/^[0-9a-fA-F]{2}$/u.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(soft.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(bytes);
}

function decodeBase64(input: string): Uint8Array {
  const cleaned = input.replace(/[^A-Za-z0-9+/=]/gu, "");
  if (!cleaned) return new Uint8Array();
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeBody(raw: Uint8Array, transferEncoding: string): Uint8Array {
  const enc = transferEncoding.toLowerCase();
  if (enc.includes("base64")) {
    return decodeBase64(latin1Decode(raw));
  }
  if (enc.includes("quoted-printable")) {
    return decodeQuotedPrintable(latin1Decode(raw));
  }
  return raw;
}

function tryDecodeText(bytes: Uint8Array, charset: string): string {
  const cs = charset.trim().toLowerCase() || "utf-8";
  const aliases: Record<string, string> = {
    utf8: "utf-8",
    "utf-8": "utf-8",
    usascii: "utf-8",
    "us-ascii": "utf-8",
    ascii: "utf-8",
    latin1: "latin1",
    "iso-8859-1": "latin1",
    "windows-1252": "windows-1252",
    gb2312: "gbk",
    gbk: "gbk",
    gb18030: "gbk",
    big5: "big5",
  };
  const label = aliases[cs.replace(/_/gu, "-")] || cs;
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return latin1Decode(bytes);
    }
  }
}

function decodeRfc2047(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/gu,
    (_m, charset: string, enc: string, payload: string) => {
      try {
        const bytes =
          enc.toLowerCase() === "b"
            ? decodeBase64(payload)
            : decodeQuotedPrintable(payload.replace(/_/gu, " "));
        return tryDecodeText(bytes, charset);
      } catch {
        return payload;
      }
    },
  );
}

function parseContentType(raw: string): { mime: string; params: Record<string, string> } {
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  const mime = (parts.shift() || "text/plain").toLowerCase();
  const params: Record<string, string> = {};
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    let v = p.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    params[k] = v;
  }
  return { mime, params };
}

function parseDisposition(raw: string): { type: string; params: Record<string, string> } {
  const { mime, params } = parseContentType(raw);
  return { type: mime.toLowerCase(), params };
}

function rfc2231Filename(params: Record<string, string>): string {
  const star = params["filename*"] || params["name*"];
  if (star) {
    const m = /^([^']*)''([\s\S]+)$/u.exec(star);
    if (m) {
      try {
        return decodeURIComponent(m[2]!.replace(/\+/gu, "%20"));
      } catch {
        return m[2]!;
      }
    }
    return star;
  }
  return params.filename || params.name || "";
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style>/giu, " ")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/p>/giu, "\n")
    .replace(/<\/div>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/\s+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

function uniqueFileName(name: string, used: Set<string>): string {
  const base = (name || "attachment").replace(/[/\\]/gu, "_").trim() || "attachment";
  if (!used.has(base.toLowerCase())) {
    used.add(base.toLowerCase());
    return base;
  }
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let i = 2;
  while (used.has(`${stem}_${i}${ext}`.toLowerCase())) i += 1;
  const next = `${stem}_${i}${ext}`;
  used.add(next.toLowerCase());
  return next;
}

type Collected = {
  texts: { mime: string; text: string }[];
  attachments: EmlAttachment[];
  warnings: string[];
};

function splitMultipart(body: Uint8Array, boundary: string): Uint8Array[] {
  const token = `--${boundary}`;
  const ascii = new TextEncoder().encode(token);
  const parts: Uint8Array[] = [];
  const hits: number[] = [];
  let from = 0;
  while (from < body.byteLength) {
    const idx = bytesIndexOf(body, ascii, from);
    if (idx < 0) break;
    hits.push(idx);
    from = idx + ascii.byteLength;
  }
  for (let i = 0; i < hits.length - 1; i++) {
    let start = hits[i]! + ascii.byteLength;
    if (body[start] === 0x2d && body[start + 1] === 0x2d) continue;
    if (body[start] === 0x0d) start += 1;
    if (body[start] === 0x0a) start += 1;
    let end = hits[i + 1]!;
    if (end >= 2 && body[end - 2] === 0x0d && body[end - 1] === 0x0a) end -= 2;
    else if (end >= 1 && body[end - 1] === 0x0a) end -= 1;
    if (end > start) parts.push(body.subarray(start, end));
  }
  return parts;
}

function walkPart(raw: Uint8Array, depth: number, acc: Collected, usedNames: Set<string>): void {
  if (depth > MAX_PART_DEPTH) {
    acc.warnings.push("邮件嵌套层级过深，部分内容已跳过。");
    return;
  }
  const { headerText, body } = splitHeadersAndBody(raw);
  const headers = unfoldHeaders(headerText);
  const ct = parseContentType(headers["content-type"] || "text/plain");
  const cd = parseDisposition(headers["content-disposition"] || "");
  const transfer = headers["content-transfer-encoding"] || "";
  const decoded = decodeBody(body, transfer);
  const filename = decodeRfc2047(rfc2231Filename({ ...ct.params, ...cd.params }));
  const isAttach =
    cd.type === "attachment" ||
    Boolean(filename) ||
    (!ct.mime.startsWith("text/") &&
      !ct.mime.startsWith("multipart/") &&
      ct.mime !== "message/rfc822");

  if (ct.mime.startsWith("multipart/")) {
    const boundary = ct.params.boundary;
    if (!boundary) {
      acc.warnings.push("multipart 缺少 boundary。");
      return;
    }
    const parts = splitMultipart(body, boundary);
    for (const p of parts) walkPart(p, depth + 1, acc, usedNames);
    return;
  }

  if (ct.mime === "message/rfc822") {
    walkPart(decoded.byteLength ? decoded : body, depth + 1, acc, usedNames);
    return;
  }

  if (isAttach && !ct.mime.startsWith("text/")) {
    if (acc.attachments.length >= MAX_EML_ATTACHMENTS) {
      acc.warnings.push(`附件超过 ${MAX_EML_ATTACHMENTS} 个，其余已跳过。`);
      return;
    }
    if (decoded.byteLength > MAX_ATTACHMENT_BYTES) {
      acc.warnings.push(`附件「${filename || "unnamed"}」过大，已跳过。`);
      return;
    }
    const name = uniqueFileName(filename || `attachment-${acc.attachments.length + 1}`, usedNames);
    acc.attachments.push({
      fileName: name,
      mimeType: ct.mime || guessMimeFromFileName(name),
      bytes: decoded,
    });
    return;
  }

  if (ct.mime.startsWith("text/")) {
    const charset = ct.params.charset || "utf-8";
    let text = tryDecodeText(decoded, charset);
    if (ct.mime.includes("html")) text = htmlToPlain(text);
    if (filename && cd.type === "attachment") {
      if (acc.attachments.length < MAX_EML_ATTACHMENTS && decoded.byteLength <= MAX_ATTACHMENT_BYTES) {
        const name = uniqueFileName(filename, usedNames);
        acc.attachments.push({
          fileName: name,
          mimeType: ct.mime || guessMimeFromFileName(name),
          bytes: decoded,
        });
      }
    }
    if (text.trim()) acc.texts.push({ mime: ct.mime, text: text.trim() });
  }
}

function pickBody(texts: { mime: string; text: string }[]): string {
  const plains = texts.filter((t) => t.mime.includes("plain"));
  if (plains.length) return plains.map((t) => t.text).join("\n\n");
  return texts.map((t) => t.text).join("\n\n");
}

export async function extractEmlPlainText(
  data: ArrayBuffer | Uint8Array,
  filename: string,
): Promise<EmlExtractResult> {
  try {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const { headerText, body } = splitHeadersAndBody(bytes);
    const headers = unfoldHeaders(headerText);
    const subject = decodeRfc2047(headers.subject || "");
    const from = decodeRfc2047(headers.from || "");
    const to = decodeRfc2047(headers.to || "");
    const date = headers.date || "";
    const acc: Collected = { texts: [], attachments: [], warnings: [] };
    const used = new Set<string>();
    walkPart(bytes, 0, acc, used);

    if (acc.texts.length === 0 && body.byteLength > 0 && acc.attachments.length === 0) {
      const ct = parseContentType(headers["content-type"] || "text/plain");
      if (!ct.mime.startsWith("multipart/")) {
        const decoded = decodeBody(body, headers["content-transfer-encoding"] || "");
        let text = tryDecodeText(decoded, ct.params.charset || "utf-8");
        if (ct.mime.includes("html")) text = htmlToPlain(text);
        if (text.trim()) acc.texts.push({ mime: ct.mime, text: text.trim() });
      }
    }

    const bodyText = pickBody(acc.texts);
    const meta = [
      `【${filename} · 邮件】`,
      subject ? `主题：${subject}` : "",
      from ? `发件人：${from}` : "",
      to ? `收件人：${to}` : "",
      date ? `日期：${date}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const attNote =
      acc.attachments.length > 0
        ? `附件 ${acc.attachments.length} 个：${acc.attachments.map((a) => a.fileName).join("、")}。已展开为独立文件。`
        : "";
    let text = [meta, bodyText || "（邮件无正文）", attNote].filter(Boolean).join("\n\n");
    let warning = acc.warnings.join(" ");
    if (text.length > MAX_TEXT_CHARS) {
      text = text.slice(0, MAX_TEXT_CHARS);
      warning = [warning, `正文过长，仅保留前 ${MAX_TEXT_CHARS} 字供检索。`].filter(Boolean).join(" ");
    }
    const parsed = Boolean(bodyText.trim()) || acc.attachments.length > 0 || Boolean(subject);
    return { text, parsed, warning: warning || undefined, attachments: acc.attachments };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      text: "",
      parsed: false,
      warning: `邮件解析失败：${msg}`,
      attachments: [],
    };
  }
}
