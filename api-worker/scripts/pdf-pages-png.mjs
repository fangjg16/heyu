/**
 * 少页图面 PDF 才整页画成 PNG（workerd 没有 @napi-rs/canvas）。
 * 百炼 compatible-mode 只接受 image_url，不能传 type=file。
 * 多页文字扫描不要走这里，解析分路会交给 OCR。
 */
import { getDocumentProxy, renderPageAsImage } from "unpdf";

export const PDF_PAGES_PNG_MAX_BYTES = 12 * 1024 * 1024;
export const PDF_PAGES_PNG_MAX_PAGES = 8;
export const PDF_PAGES_PNG_WIDTH = 1600;
/** 大扫描 PDF 按页 OCR：官方 100MB / 50 页；一页一请求，不要一次画 50 张 */
export const PDF_PAGE_PNG_OCR_MAX_BYTES = 100 * 1024 * 1024;
export const PDF_PAGE_PNG_OCR_MAX_PAGES = 50;
export const PDF_PAGE_PNG_OCR_WIDTH = 1400;

function copyBytes(bytes) {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const out = new Uint8Array(src.byteLength);
  out.set(src);
  return out;
}

function looksLikePngDataUrl(s) {
  return typeof s === "string" && s.startsWith("data:image/") && s.includes("base64,");
}

/**
 * @param {Uint8Array | ArrayBuffer} bytes
 * @param {{ fileName?: string, maxPages?: number, width?: number }} [opts]
 * @returns {Promise<{ pages: Array<{ dataUrl: string, label: string }>, totalPages: number }>}
 */
export async function rasterizePdfPages(bytes, opts = {}) {
  const owned = copyBytes(bytes);
  if (owned.byteLength === 0) {
    return { pages: [], totalPages: 0 };
  }
  if (owned.byteLength > PDF_PAGES_PNG_MAX_BYTES) {
    throw new Error(
      `PDF 约 ${(owned.byteLength / 1024 / 1024).toFixed(1)} MB，超过整页栅格上限`,
    );
  }
  const fileName = String(opts.fileName || "document.pdf").trim() || "document.pdf";
  const width = Number(opts.width) > 0 ? Number(opts.width) : PDF_PAGES_PNG_WIDTH;
  const pdf = await getDocumentProxy(copyBytes(owned));
  const totalPages = Number(pdf.numPages) || 1;
  const cap = Math.min(
    totalPages,
    Math.max(1, Math.min(Number(opts.maxPages) || PDF_PAGES_PNG_MAX_PAGES, PDF_PAGES_PNG_MAX_PAGES)),
  );
  const pages = [];
  for (let page = 1; page <= cap; page++) {
    const dataUrl = await renderPageAsImage(copyBytes(owned), page, {
      canvasImport: () => import("@napi-rs/canvas"),
      width,
      toDataURL: true,
    });
    if (!looksLikePngDataUrl(dataUrl)) continue;
    pages.push({
      dataUrl,
      label: totalPages > 1 ? `${fileName} 第${page}页` : fileName,
    });
  }
  return { pages, totalPages };
}

/**
 * 单页栅格给 OCR 回退。workerd 禁止 import canvas，只能本机 Node 调这里。
 * @param {Uint8Array | ArrayBuffer} bytes
 * @param {{ page?: number, width?: number }} [opts]
 * @returns {Promise<{ dataUrl: string, page: number, totalPages: number }>}
 */
export async function rasterizePdfPage(bytes, opts = {}) {
  const owned = copyBytes(bytes);
  if (owned.byteLength === 0) {
    throw new Error("空 PDF，无法单页栅格");
  }
  if (owned.byteLength > PDF_PAGE_PNG_OCR_MAX_BYTES) {
    throw new Error(
      `PDF 约 ${(owned.byteLength / 1024 / 1024).toFixed(1)} MB，超过单页栅格上限 ${PDF_PAGE_PNG_OCR_MAX_BYTES / 1024 / 1024}MB`,
    );
  }
  const page = Math.max(1, Math.floor(Number(opts.page) || 1));
  if (page > PDF_PAGE_PNG_OCR_MAX_PAGES) {
    throw new Error(`页码超过 OCR 上限 ${PDF_PAGE_PNG_OCR_MAX_PAGES}`);
  }
  const width = Number(opts.width) > 0 ? Number(opts.width) : PDF_PAGE_PNG_OCR_WIDTH;
  const pdf = await getDocumentProxy(copyBytes(owned));
  const totalPages = Number(pdf.numPages) || 1;
  if (page > totalPages) {
    throw new Error(`页码 ${page} 超出共 ${totalPages} 页`);
  }
  const dataUrl = await renderPageAsImage(copyBytes(owned), page, {
    canvasImport: () => import("@napi-rs/canvas"),
    width,
    toDataURL: true,
  });
  if (!looksLikePngDataUrl(dataUrl)) {
    throw new Error(`第${page}页未能栅格成 PNG`);
  }
  return { dataUrl, page, totalPages };
}
