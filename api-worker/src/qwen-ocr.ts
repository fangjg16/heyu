import { withResolvedDashscopeEnv, type LlmRuntimeEnv } from "./llm-runtime-config";

export const QWEN_OCR_MODEL_DEFAULT = "qwen3.5-ocr";

/** Base64 编码后上限约 10MB；原始文件建议 ≤ 7MB */
export const OCR_IMAGE_RAW_MAX = 7 * 1024 * 1024;
export const OCR_IMAGE_B64_MAX = 10 * 1024 * 1024;
/** 整包 Base64 塞进 JSON 的上限；更大的扫描 PDF 改上传文件或按页 OCR */
export const OCR_PDF_RAW_MAX = 20 * 1024 * 1024;
/** qwen3.5-ocr 官方：PDF 100MB / 50 页 */
export const OCR_PDF_OFFICIAL_RAW_MAX = 100 * 1024 * 1024;
export const OCR_PDF_PAGE_MAX = 50;
const OCR_PAGE_RENDER_WIDTH = 1400;

const IMAGE_PROMPT =
  "请提取图中全部文字，保持原有阅读顺序与换行。只输出提取的文字，不要解释、不要markdown围栏。";

const PDF_PROMPT =
  "请提取该 PDF 中的全部文字、表格与公式，保持阅读顺序。只输出提取结果，不要解释。";

export type QwenOcrEnv = LlmRuntimeEnv & {
  QWEN_OCR_MODEL?: string;
};

export type QwenOcrResult = {
  text: string;
  ok: boolean;
  warning?: string;
};

export type OcrPdfPageImage = {
  mime: string;
  bytes: Uint8Array;
};

export type OcrPdfRenderPage = (
  page: number,
  totalPages: number,
) => Promise<OcrPdfPageImage | null>;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function ocrModel(env: QwenOcrEnv): string {
  return (env.QWEN_OCR_MODEL || QWEN_OCR_MODEL_DEFAULT).trim() || QWEN_OCR_MODEL_DEFAULT;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function collectStrings(v: unknown, into: string[], depth = 0): void {
  if (depth > 8 || v == null) return;
  if (typeof v === "string") {
    const t = v.trim();
    if (t) into.push(t);
    return;
  }
  if (Array.isArray(v)) {
    for (const item of v) collectStrings(item, into, depth + 1);
    return;
  }
  const rec = asRecord(v);
  if (!rec) return;
  for (const key of ["ocr_result", "output_text", "text", "content"]) {
    if (key in rec) collectStrings(rec[key], into, depth + 1);
  }
  if (Array.isArray(rec.output)) collectStrings(rec.output, into, depth + 1);
  if (Array.isArray(rec.choices)) {
    for (const c of rec.choices) {
      const ch = asRecord(c);
      const msg = asRecord(ch?.message);
      if (msg) collectStrings(msg.content, into, depth + 1);
    }
  }
}

export function extractOcrTextFromResponse(raw: unknown): string {
  const rec = asRecord(raw);
  if (!rec) return "";
  const parts: string[] = [];
  collectStrings(rec.ocr_result ?? rec.output_text, parts);
  if (parts.length === 0) collectStrings(raw, parts);
  const unique = [...new Set(parts.map((s) => s.trim()).filter(Boolean))];
  return unique.join("\n\n").trim();
}

async function parseJsonResponse(
  res: Response,
  label: string,
): Promise<Record<string, unknown>> {
  const rawText = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`${label} 返回非 JSON（HTTP ${res.status}）`);
  }
  if (!res.ok) {
    const err =
      (raw.error as { message?: string } | undefined)?.message ||
      (raw.message as string) ||
      (raw.detail as string) ||
      `${label} HTTP ${res.status}`;
    throw new Error(String(err));
  }
  return raw;
}

async function resolvedKeyBase(env: QwenOcrEnv): Promise<{
  key: string;
  base: string;
  model: string;
}> {
  const resolved = await withResolvedDashscopeEnv(env);
  const key = (resolved.DASHSCOPE_API_KEY || "").trim();
  const base = (
    resolved.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
  )
    .trim()
    .replace(/\/$/, "");
  if (!key) {
    throw new Error(
      "无法 OCR：未配置 DASHSCOPE_API_KEY（也未在管理台保存 API Key）。扫描件和图片需要开通 qwen3.5-ocr。",
    );
  }
  return { key, base, model: ocrModel(env) };
}

export async function ocrImageWithQwen(
  env: QwenOcrEnv,
  opts: {
    bytes: Uint8Array;
    fileName: string;
    mimeType: string;
    fetchImpl?: FetchLike;
  },
): Promise<QwenOcrResult> {
  try {
    if (opts.bytes.byteLength === 0) {
      return { text: "", ok: false, warning: `${opts.fileName} 是空文件，无法 OCR。` };
    }
    if (opts.bytes.byteLength > OCR_IMAGE_RAW_MAX) {
      return {
        text: "",
        ok: false,
        warning: `${opts.fileName} 约 ${(opts.bytes.byteLength / 1024 / 1024).toFixed(1)} MB，超过 qwen3.5-ocr 兼容接口 Base64 上限（原始建议 ≤ 7MB，编码后 ≤ 10MB）。请压缩后重新上传。`,
      };
    }
    const { key, base, model } = await resolvedKeyBase(env);
    const fetchImpl = opts.fetchImpl ?? fetch;
    const b64 = uint8ToBase64(opts.bytes);
    if (b64.length > OCR_IMAGE_B64_MAX) {
      return {
        text: "",
        ok: false,
        warning: `${opts.fileName} Base64 后超过 10MB，qwen3.5-ocr 兼容接口无法接收。请压缩后重新上传。`,
      };
    }
    const mime = (opts.mimeType || "image/jpeg").split(";")[0]!.trim() || "image/jpeg";
    const dataUrl = `data:${mime};base64,${b64}`;
    const res = await fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUrl },
                min_pixels: 3072,
                max_pixels: 8388608,
              },
              { type: "text", text: IMAGE_PROMPT },
            ],
          },
        ],
        stream: false,
        enable_thinking: false,
      }),
    });
    const raw = await parseJsonResponse(res, "qwen3.5-ocr 图片");
    const text = extractOcrTextFromResponse(raw);
    if (!text) {
      return { text: "", ok: false, warning: `${opts.fileName} OCR 未返回文字。` };
    }
    return { text, ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: "", ok: false, warning: `${opts.fileName} OCR 失败：${msg}` };
  }
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function parseUploadedFileId(raw: unknown): string | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = typeof rec.id === "string" ? rec.id.trim() : "";
  if (id) return id;
  const data = asRecord(rec.data);
  const nested = typeof data?.id === "string" ? data.id.trim() : "";
  return nested || null;
}

function dataUrlToBytes(dataUrl: string): OcrPdfPageImage | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/u);
  if (!m) return null;
  const mime = (m[1] || "image/png").trim() || "image/png";
  const b64 = m[2] || "";
  if (!b64) return null;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}

async function countPdfPages(bytes: Uint8Array): Promise<number> {
  const { getDocumentProxy } = await import("unpdf");
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const pdf = await getDocumentProxy(copy);
  return Math.max(1, Number(pdf.numPages) || 1);
}

async function renderPdfPageImage(
  bytes: Uint8Array,
  page: number,
): Promise<OcrPdfPageImage | null> {
  const { renderPageAsImage } = await import("unpdf");
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const dataUrl = await renderPageAsImage(copy, page, {
    canvasImport: () => import("@napi-rs/canvas"),
    width: OCR_PAGE_RENDER_WIDTH,
    toDataURL: true,
  });
  if (typeof dataUrl !== "string") return null;
  return dataUrlToBytes(dataUrl);
}

async function ocrPdfViaResponses(opts: {
  env: QwenOcrEnv;
  fetchImpl: FetchLike;
  fileName: string;
  maxPages: number;
  filePart: Record<string, unknown>;
}): Promise<QwenOcrResult> {
  const { key, base, model } = await resolvedKeyBase(opts.env);
  const tasks = ["document_parsing", "text_recognition"] as const;
  const warnings: string[] = [];
  for (const task of tasks) {
    const body = {
      model,
      input: [
        {
          role: "user",
          content: [
            opts.filePart,
            { type: "input_text", text: PDF_PROMPT },
          ],
        },
      ],
      ocr_options: {
        task,
        task_config: { max_pages: opts.maxPages },
      },
    };
    const res = await opts.fetchImpl(`${base}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    try {
      const raw = await parseJsonResponse(res, "qwen3.5-ocr PDF");
      const text = extractOcrTextFromResponse(raw);
      if (text) return { text, ok: true };
      warnings.push(`${task} 未返回文字`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`${task}：${msg}`);
    }
  }
  return {
    text: "",
    ok: false,
    warning: `${opts.fileName} PDF OCR 未返回文字（${warnings.join("；")}）。请确认百炼已开通 qwen3.5-ocr，且兼容域名支持 /v1/responses。`,
  };
}

async function ocrPdfViaFileUpload(opts: {
  env: QwenOcrEnv;
  fetchImpl: FetchLike;
  fileName: string;
  bytes: Uint8Array;
  maxPages: number;
}): Promise<QwenOcrResult> {
  const { key, base } = await resolvedKeyBase(opts.env);
  const form = new FormData();
  form.append(
    "file",
    new Blob([opts.bytes], { type: "application/pdf" }),
    opts.fileName || "document.pdf",
  );
  form.append("purpose", "file-extract");
  const up = await opts.fetchImpl(`${base}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const raw = await parseJsonResponse(up, "qwen3.5-ocr 上传 PDF");
  const fileId = parseUploadedFileId(raw);
  if (!fileId) {
    return { text: "", ok: false, warning: `${opts.fileName} 上传百炼后未返回 file_id。` };
  }
  const rec = asRecord(raw);
  const fileUrl =
    (typeof rec?.url === "string" && rec.url.trim()) ||
    (typeof asRecord(rec?.data)?.url === "string" &&
      String(asRecord(rec?.data)?.url).trim()) ||
    "";
  const parts: Record<string, unknown>[] = [
    { type: "input_file", filename: opts.fileName || "document.pdf", file_id: fileId },
  ];
  if (fileUrl) {
    parts.unshift({
      type: "input_file",
      filename: opts.fileName || "document.pdf",
      file_url: fileUrl,
    });
  }
  const warnings: string[] = [];
  for (const filePart of parts) {
    const r = await ocrPdfViaResponses({
      env: opts.env,
      fetchImpl: opts.fetchImpl,
      fileName: opts.fileName,
      maxPages: opts.maxPages,
      filePart,
    });
    if (r.ok && r.text.trim()) return r;
    if (r.warning) warnings.push(r.warning);
  }
  return {
    text: "",
    ok: false,
    warning: warnings[0] || `${opts.fileName} 已上传百炼，但 OCR 未返回文字。`,
  };
}

async function ocrPdfViaPageImages(opts: {
  env: QwenOcrEnv;
  fetchImpl: FetchLike;
  fileName: string;
  bytes: Uint8Array;
  maxPages: number;
  pageCount?: number;
  renderPage?: OcrPdfRenderPage;
}): Promise<QwenOcrResult> {
  let total = opts.pageCount && opts.pageCount > 0 ? opts.pageCount : 0;
  if (!total) {
    try {
      total = await countPdfPages(opts.bytes);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { text: "", ok: false, warning: `${opts.fileName} 无法读取页数：${msg}` };
    }
  }
  const cap = Math.min(Math.max(1, total), opts.maxPages, OCR_PDF_PAGE_MAX);
  const render =
    opts.renderPage ??
    ((page: number) => renderPdfPageImage(opts.bytes, page));
  const parts: string[] = [];
  const pageWarnings: string[] = [];
  for (let page = 1; page <= cap; page++) {
    let image: OcrPdfPageImage | null = null;
    try {
      image = await render(page, total);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pageWarnings.push(`第${page}页渲染失败：${msg}`);
      continue;
    }
    if (!image || image.bytes.byteLength === 0) {
      pageWarnings.push(`第${page}页没有图像`);
      continue;
    }
    const r = await ocrImageWithQwen(opts.env, {
      bytes: image.bytes,
      fileName: `${opts.fileName}#${page}`,
      mimeType: image.mime,
      fetchImpl: opts.fetchImpl,
    });
    if (r.ok && r.text.trim()) {
      parts.push(total > 1 ? `【第${page}页】\n${r.text.trim()}` : r.text.trim());
    } else if (r.warning) {
      pageWarnings.push(`第${page}页：${r.warning}`);
    }
  }
  if (parts.length === 0) {
    return {
      text: "",
      ok: false,
      warning:
        `${opts.fileName} 约 ${mb(opts.bytes.byteLength)} MB，已按页 OCR 但未抽出文字。` +
        (pageWarnings.length ? `（${pageWarnings.slice(0, 3).join("；")}）` : ""),
    };
  }
  const extra =
    total > cap
      ? `PDF 共 ${total} 页，OCR 处理了前 ${cap} 页。`
      : undefined;
  return {
    text: parts.join("\n\n"),
    ok: true,
    warning: extra,
  };
}

export async function ocrPdfWithQwen(
  env: QwenOcrEnv,
  opts: {
    bytes: Uint8Array;
    fileName: string;
    fetchImpl?: FetchLike;
    maxPages?: number;
    pageCount?: number;
    renderPage?: OcrPdfRenderPage;
  },
): Promise<QwenOcrResult> {
  try {
    if (opts.bytes.byteLength === 0) {
      return { text: "", ok: false, warning: `${opts.fileName} 是空 PDF，无法 OCR。` };
    }
    if (opts.bytes.byteLength > OCR_PDF_OFFICIAL_RAW_MAX) {
      return {
        text: "",
        ok: false,
        warning: `${opts.fileName} 约 ${mb(opts.bytes.byteLength)} MB，超过 qwen3.5-ocr 官方上限 ${OCR_PDF_OFFICIAL_RAW_MAX / 1024 / 1024}MB / ${OCR_PDF_PAGE_MAX} 页。请拆成多份后重新上传。`,
      };
    }
    const fetchImpl = opts.fetchImpl ?? fetch;
    const maxPages = Math.min(opts.maxPages ?? OCR_PDF_PAGE_MAX, OCR_PDF_PAGE_MAX);
    if (opts.bytes.byteLength > OCR_PDF_RAW_MAX) {
      const uploaded = await ocrPdfViaFileUpload({
        env,
        fetchImpl,
        fileName: opts.fileName,
        bytes: opts.bytes,
        maxPages,
      }).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          text: "",
          ok: false,
          warning: `${opts.fileName} 上传百炼失败：${msg}`,
        } satisfies QwenOcrResult;
      });
      if (uploaded.ok && uploaded.text.trim()) return uploaded;
      const paged = await ocrPdfViaPageImages({
        env,
        fetchImpl,
        fileName: opts.fileName,
        bytes: opts.bytes,
        maxPages,
        pageCount: opts.pageCount,
        renderPage: opts.renderPage,
      });
      if (paged.ok && paged.text.trim()) {
        return {
          ...paged,
          warning: [uploaded.warning, paged.warning].filter(Boolean).join(" "),
        };
      }
      return {
        text: "",
        ok: false,
        warning: [uploaded.warning, paged.warning].filter(Boolean).join(" "),
      };
    }
    const b64 = uint8ToBase64(opts.bytes);
    const dataUrl = `data:application/pdf;base64,${b64}`;
    return ocrPdfViaResponses({
      env,
      fetchImpl,
      fileName: opts.fileName,
      maxPages,
      filePart: {
        type: "input_file",
        filename: opts.fileName || "document.pdf",
        file_data: dataUrl,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: "", ok: false, warning: `${opts.fileName} PDF OCR 失败：${msg}` };
  }
}
