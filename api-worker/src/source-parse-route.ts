/**
 * 源文件解析分路（抽字 vs 看图 vs OCR）。
 *
 * 类型其实就这些：
 * - 图片（jpg/png 等）→ 视觉模型。大图先压缩，不要整份原文件直接失败。
 * - 可抽字 PDF / Word / 邮件 / Excel / 纯文本 → 抽字 + 文本模型。不要看图。
 * - 不可抽字 PDF
 *   - 图面（测绘图、总平、航拍等，通常页数少）→ 整页栅格成 PNG 再看图
 *     （百炼 compatible-mode 不收 type=file，这是少页图面才走的路径，不是所有 PDF）
 *   - 文字多的扫描件（几十页合同）→ OCR，不要整份画成 PNG
 */
import {
  isDocFileName,
  isDocxFileName,
  isEmlFileName,
  isImageFileName,
  isPdfFileName,
  isPlainTextFileName,
  isSpreadsheetFileName,
} from "./file-mime";

export type SourceParseRoute = "text" | "image-vl" | "pdf-vl" | "pdf-ocr" | "skip";

/** 少页图面才整页栅格；超过这个页数的无字 PDF 走 OCR */
export const SOURCE_PARSE_PDF_VL_MAX_PAGES = 8;

/** 抽到的正文少于此字数，不能当可复制 PDF */
export const SOURCE_PARSE_TEXT_MIN_CHARS = 80;

/** 每页少于此字数视为文字层稀疏（测绘图矢量注记） */
export const SOURCE_PARSE_CHARS_PER_PAGE = 400;

const DIRECTORY_MIME = "application/x-directory";

export function looksLikePlanOrMapFileName(fileName: string): boolean {
  const n = (fileName || "").toLowerCase();
  if (!n.trim()) return false;
  return /测绘图|规划图|规划图集|总体规划|总平面|总平图|平面图|区位图|红线图|地图|航拍|测绘/u.test(
    fileName,
  ) ||
    /site[\s._-]*plan|master[\s._-]*plan|survey|cadastral|title[\s._-]*plan|floor[\s._-]*plan|layout/iu.test(
      n,
    );
}

/** 去掉抽字头 `【文件名 · PDF 提取正文】` 再计字数 */
export function sourceParseBodyCharCount(text: string): number {
  const body = (text ?? "").replace(/^【[^\n]+】\n?/u, "").trim();
  if (!body) return 0;
  return Array.from(body).length;
}

export function pdfExtractLooksSparse(text: string, pageCount: number): boolean {
  const chars = sourceParseBodyCharCount(text);
  if (chars <= 0) return true;
  const pages = Math.max(pageCount || 1, 1);
  return chars < SOURCE_PARSE_CHARS_PER_PAGE * pages;
}

export function classifySourceParseRoute(input: {
  fileName: string;
  mime?: string | null;
  pageCount?: number | null;
  extractedCharCount?: number;
}): SourceParseRoute {
  const fileName = input.fileName || "";
  const mime = input.mime ?? null;
  if (fileName === ".keep" || (mime ?? "").trim() === DIRECTORY_MIME) {
    return "skip";
  }
  if (isImageFileName(fileName, mime)) return "image-vl";
  if (
    isDocxFileName(fileName, mime) ||
    isDocFileName(fileName, mime) ||
    isEmlFileName(fileName, mime) ||
    isSpreadsheetFileName(fileName, mime) ||
    isPlainTextFileName(fileName, mime)
  ) {
    return "text";
  }
  if (!isPdfFileName(fileName, mime)) {
    return "text";
  }

  const pages =
    input.pageCount && input.pageCount > 0 ? input.pageCount : 1;
  const chars = Math.max(0, input.extractedCharCount ?? 0);
  const sparse = chars < SOURCE_PARSE_CHARS_PER_PAGE * pages;
  const hasCopyableText = chars >= SOURCE_PARSE_TEXT_MIN_CHARS && !sparse;
  if (hasCopyableText) return "text";

  if (looksLikePlanOrMapFileName(fileName) || pages <= SOURCE_PARSE_PDF_VL_MAX_PAGES) {
    return "pdf-vl";
  }
  return "pdf-ocr";
}
