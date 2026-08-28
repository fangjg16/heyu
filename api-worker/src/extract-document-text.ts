import { extractEmlPlainText, type EmlAttachment } from "./eml-text";
import {
  guessMimeFromFileName,
  isDocFileName,
  isDocxFileName,
  isEmlFileName,
  isImageFileName,
  isPdfFileName,
  isPlainTextFileName,
  isSpreadsheetFileName,
  isZipFileName,
} from "./file-mime";
import type { LlmClientEnv } from "./llm-client";
import { extractDocPlainText, extractDocxPlainText } from "./office-text";
import { extractPdfPlainText } from "./pdf-text";
import { ocrImageWithQwen, ocrPdfWithQwen } from "./qwen-ocr";
import { extractSpreadsheetPlainText } from "./spreadsheet-text";
import { pdfExtractLooksSparse } from "./source-parse-route";
import { shouldSkipZipEntry, unzipToEntries } from "./zip-inflate";

const MAX_TEXT_CHARS = 200_000;
const MAX_NEST_DEPTH = 3;
const MAX_ZIP_ENTRIES = 80;
const MAX_ZIP_ENTRY_BYTES = 40_000_000;

export const OCR_PENDING_IMAGE = "等待 OCR 解析正文";
export const OCR_PENDING_PDF = "等待 OCR 解析正文";

export type ExtractAttachment = EmlAttachment;

export type ExtractDocumentResult = {
  text: string;
  parsed: boolean;
  /** 本地未抽到字，需要（或正在）走 qwen3.5-ocr */
  needsOcr: boolean;
  warning?: string;
  attachments?: ExtractAttachment[];
};

export type ExtractDocumentOptions = {
  bytes: ArrayBuffer | Uint8Array;
  fileName: string;
  mimeType?: string | null;
  env?: LlmClientEnv | null;
  allowOcr?: boolean;
  /** 多页文字扫描：即使有稀疏文字层也走 OCR，不要把矢量注记当成可复制正文 */
  preferOcr?: boolean;
  depth?: number;
  fetchImpl?: typeof fetch;
};

function toUint8(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** 独立拷贝，避免 unpdf/pdf.js 把原 ArrayBuffer transfer 卸掉后 OCR 读到 detached */
export function copyOwnedBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  const src = toUint8(data);
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  return out;
}

function uint8ToArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

function capText(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_TEXT_CHARS) return t;
  return `${t.slice(0, MAX_TEXT_CHARS)}\n\n…（正文已截断）`;
}

export function ocrPendingPlaceholder(kind: "image" | "pdf", fileName: string): string {
  if (kind === "image") {
    return `（已上传图片：${fileName}，${OCR_PENDING_IMAGE}。）`;
  }
  return `（已上传 PDF：${fileName}。未能从 PDF 提取文字（多为扫描件/图片版），${OCR_PENDING_PDF}。）`;
}

/** pdf.js/unpdf 把 ArrayBuffer transfer 卸掉后的运行时错误；应重抽，不当 OCR 定稿 */
export function looksLikeDetachedBufferError(text: string): boolean {
  return /detached ArrayBuffer/iu.test(text);
}

/** OCR 已经跑过并失败：不要再当占位符重试，以免循环扣费 */
export function looksLikeOcrGaveUp(text: string): boolean {
  if (looksLikeDetachedBufferError(text)) return false;
  return /OCR 未抽出|OCR 失败|无法 OCR：/u.test(text);
}

/**
 * 合入 OCR 之前入库的扫描 PDF 占位（unpdf 抽不出字，当时不会标「等待 OCR」）。
 */
export function looksLikeLegacyScanPdfPlaceholder(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikeOcrGaveUp(t)) return false;
  if (/未能从 PDF 提取文字/u.test(t) && /扫描件|图片版/u.test(t)) return true;
  if (t.startsWith("（已上传 PDF：") && /请上传可复制文字/u.test(t)) return true;
  return false;
}

/**
 * 是否应重新走提取（含 OCR）。成功失败的定稿文案不要匹配，以免死循环扣费。
 */
export function looksLikeUnparsedPlaceholder(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (looksLikeDetachedBufferError(t)) return true;
  if (looksLikeOcrGaveUp(t)) return false;
  if (t.includes(OCR_PENDING_IMAGE) || t.includes("正在用 OCR")) return true;
  if (t.includes("暂未解析正文")) return true;
  if (t.startsWith("（已上传图片")) return true;
  if (looksLikeLegacyScanPdfPlaceholder(t)) return true;
  if (t.startsWith("（已上传 PDF：") && /多为扫描件|未能从 PDF 提取/u.test(t) && t.includes("等待 OCR")) {
    return true;
  }
  if (t.startsWith("（已上传文件：") && t.includes("暂未解析")) return true;
  return false;
}

function joinWarning(...parts: Array<string | undefined>): string | undefined {
  const s = parts.filter(Boolean).join(" ").trim();
  return s || undefined;
}

function withHeader(fileName: string, kind: string, body: string): string {
  return capText(`【${fileName} · ${kind}】\n${body}`);
}

async function extractZipContents(
  bytes: Uint8Array,
  fileName: string,
  opts: ExtractDocumentOptions,
): Promise<ExtractDocumentResult> {
  const depth = opts.depth ?? 0;
  if (depth >= MAX_NEST_DEPTH) {
    return {
      text: `（ZIP「${fileName}」嵌套超过 ${MAX_NEST_DEPTH} 层，已停止展开。）`,
      parsed: false,
      needsOcr: false,
    };
  }
  let entries: Record<string, Uint8Array>;
  try {
    entries = await unzipToEntries(bytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: "", parsed: false, needsOcr: false, warning: msg };
  }
  const names = Object.keys(entries).filter((p) => !shouldSkipZipEntry(p));
  if (names.length === 0) {
    return { text: "", parsed: false, needsOcr: false, warning: `${fileName} 内没有可解析的文件。` };
  }
  const blocks: string[] = [`【${fileName} · ZIP 展开】`];
  const warnings: string[] = [];
  let any = false;
  let used = 0;
  for (const path of names) {
    if (used >= MAX_ZIP_ENTRIES) {
      warnings.push(`ZIP 内超过 ${MAX_ZIP_ENTRIES} 个文件，其余未解析。`);
      break;
    }
    const data = entries[path]!;
    if (data.byteLength > MAX_ZIP_ENTRY_BYTES) {
      warnings.push(`${path} 过大，已跳过。`);
      continue;
    }
    used += 1;
    const base = path.split("/").filter(Boolean).pop() || path;
    const inner = await extractDocumentText({
      ...opts,
      bytes: data,
      fileName: base,
      mimeType: guessMimeFromFileName(base),
      depth: depth + 1,
    });
    if (inner.warning) warnings.push(`${path}：${inner.warning}`);
    if (inner.parsed && inner.text.trim() && !inner.needsOcr) {
      any = true;
      blocks.push(`— ${path} —\n${inner.text.trim()}`);
    } else if (inner.needsOcr) {
      blocks.push(`— ${path} —\n${inner.text.trim() || ocrPendingPlaceholder("image", base)}`);
    } else if (inner.text.trim()) {
      blocks.push(`— ${path} —\n${inner.text.trim()}`);
    }
  }
  const text = capText(blocks.join("\n\n"));
  const needsOcr = text.includes(OCR_PENDING_IMAGE);
  return {
    text,
    parsed: any || needsOcr,
    needsOcr,
    warning: joinWarning(...warnings),
  };
}

async function extractImage(
  bytes: Uint8Array,
  fileName: string,
  mime: string,
  opts: ExtractDocumentOptions,
): Promise<ExtractDocumentResult> {
  if (!opts.allowOcr) {
    return {
      text: ocrPendingPlaceholder("image", fileName),
      parsed: true,
      needsOcr: true,
    };
  }
  if (!opts.env) {
    return {
      text: `（无法 OCR：运行时未注入大模型配置。图片「${fileName}」需要 qwen3.5-ocr。）`,
      parsed: false,
      needsOcr: false,
    };
  }
  const ocr = await ocrImageWithQwen(opts.env, {
    bytes,
    fileName,
    mimeType: mime || guessMimeFromFileName(fileName),
    fetchImpl: opts.fetchImpl,
  });
  if (!ocr.ok || !ocr.text.trim()) {
    return {
      text: `（图片「${fileName}」OCR 未抽出文字。${ocr.warning ?? ""}）`,
      parsed: false,
      needsOcr: false,
      warning: ocr.warning,
    };
  }
  return {
    text: withHeader(fileName, "OCR", ocr.text),
    parsed: true,
    needsOcr: false,
    warning: ocr.warning,
  };
}

async function extractPdf(
  input: ArrayBuffer | Uint8Array,
  fileName: string,
  opts: ExtractDocumentOptions,
): Promise<ExtractDocumentResult> {
  // unpdf/pdf.js 会 transfer 传入的 ArrayBuffer；OCR 必须用另一份拷贝
  const owned = copyOwnedBytes(input);
  let local: Awaited<ReturnType<typeof extractPdfPlainText>>;
  try {
    local = await extractPdfPlainText(uint8ToArrayBuffer(copyOwnedBytes(owned)), fileName);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    local = {
      text: "",
      totalPages: 0,
      parsed: false,
      warning: `PDF 解析失败：${msg}`,
    };
  }
  if (local.parsed && local.text.trim()) {
    const sparse = pdfExtractLooksSparse(local.text, local.totalPages);
    if (!(opts.preferOcr && sparse)) {
      return {
        text: capText(local.text),
        parsed: true,
        needsOcr: false,
        warning: local.warning,
      };
    }
  }
  if (!opts.allowOcr) {
    return {
      text: ocrPendingPlaceholder("pdf", fileName),
      parsed: true,
      needsOcr: true,
      warning: local.warning,
    };
  }
  if (!opts.env) {
    return {
      text: `（无法 OCR：运行时未注入大模型配置。扫描 PDF「${fileName}」需要 qwen3.5-ocr。）`,
      parsed: false,
      needsOcr: false,
      warning: local.warning,
    };
  }
  const ocr = await ocrPdfWithQwen(opts.env, {
    bytes: owned,
    fileName,
    fetchImpl: opts.fetchImpl,
    maxPages: local.totalPages > 0 ? local.totalPages : undefined,
    pageCount: local.totalPages > 0 ? local.totalPages : undefined,
  });
  if (!ocr.ok || !ocr.text.trim()) {
    return {
      text: `（扫描 PDF「${fileName}」OCR 未抽出文字。${ocr.warning ?? local.warning ?? ""}）`,
      parsed: false,
      needsOcr: false,
      warning: joinWarning(local.warning, ocr.warning),
    };
  }
  const extra =
    local.totalPages > 50
      ? `PDF 共 ${local.totalPages} 页，OCR 最多处理 50 页。`
      : undefined;
  return {
    text: withHeader(fileName, "OCR", ocr.text),
    parsed: true,
    needsOcr: false,
    warning: joinWarning(extra, ocr.warning),
  };
}

/**
 * 统一抽字：本地能抽的立刻抽；扫描 PDF / 图片按 qwen3.5-ocr（allowOcr 时才打 API）。
 * ZIP 在服务端展开并拼接正文（文件入库仍由前端解压或「解压」按钮完成）。
 * EML 抽出正文，附件字节返回给调用方入库。
 */
export async function extractDocumentText(
  opts: ExtractDocumentOptions,
): Promise<ExtractDocumentResult> {
  const fileName = opts.fileName || "file";
  const mime = (opts.mimeType || "").trim() || guessMimeFromFileName(fileName);
  const bytes = copyOwnedBytes(opts.bytes);
  const depth = opts.depth ?? 0;
  const ab = uint8ToArrayBuffer(bytes);

  if (isZipFileName(fileName, mime)) {
    return extractZipContents(bytes, fileName, { ...opts, depth });
  }

  if (isEmlFileName(fileName, mime)) {
    const eml = await extractEmlPlainText(bytes, fileName);
    if (!eml.parsed) {
      return {
        text: `（已上传邮件：${fileName}。${eml.warning ?? "未能解析"}）`,
        parsed: false,
        needsOcr: false,
        warning: eml.warning,
        attachments: eml.attachments,
      };
    }
    return {
      text: capText(eml.text),
      parsed: true,
      needsOcr: false,
      warning: eml.warning,
      attachments: eml.attachments,
    };
  }

  if (isDocxFileName(fileName, mime)) {
    const extracted = await extractDocxPlainText(bytes, fileName);
    if (extracted.parsed && extracted.text) {
      return { text: capText(extracted.text), parsed: true, needsOcr: false, warning: extracted.warning };
    }
    return {
      text: `（已上传 Word：${fileName}。${extracted.warning ?? "未能提取正文"}）`,
      parsed: false,
      needsOcr: false,
      warning: extracted.warning,
    };
  }

  if (isDocFileName(fileName, mime)) {
    const extracted = await extractDocPlainText(bytes, fileName);
    if (extracted.parsed && extracted.text) {
      return { text: capText(extracted.text), parsed: true, needsOcr: false, warning: extracted.warning };
    }
    return {
      text: `（已上传 Word：${fileName}。${extracted.warning ?? "未能提取正文"}）`,
      parsed: false,
      needsOcr: false,
      warning: extracted.warning,
    };
  }

  if (isPlainTextFileName(fileName, mime)) {
    const text = new TextDecoder("utf-8").decode(bytes);
    return { text: capText(text), parsed: Boolean(text.trim()), needsOcr: false };
  }

  if (isSpreadsheetFileName(fileName, mime)) {
    const extracted = await extractSpreadsheetPlainText(ab, fileName);
    if (extracted.parsed && extracted.text) {
      return { text: capText(extracted.text), parsed: true, needsOcr: false, warning: extracted.warning };
    }
    return {
      text: `（已上传 Excel：${fileName}。${extracted.warning ?? "未能提取表格正文"}）`,
      parsed: false,
      needsOcr: false,
      warning: extracted.warning,
    };
  }

  if (isPdfFileName(fileName, mime)) {
    return extractPdf(bytes, fileName, opts);
  }

  if (isImageFileName(fileName, mime)) {
    return extractImage(bytes, fileName, mime, opts);
  }

  return {
    text: `（已上传文件：${fileName}，类型 ${mime || "未知"}，暂未解析正文。）`,
    parsed: false,
    needsOcr: false,
  };
}
