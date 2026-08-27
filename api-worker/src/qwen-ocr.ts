import { withResolvedDashscopeEnv, type LlmRuntimeEnv } from "./llm-runtime-config";

export const QWEN_OCR_MODEL_DEFAULT = "qwen3.5-ocr";

/** Base64 编码后上限约 10MB；原始文件建议 ≤ 7MB */
export const OCR_IMAGE_RAW_MAX = 7 * 1024 * 1024;
export const OCR_IMAGE_B64_MAX = 10 * 1024 * 1024;
/** 扫描 PDF：官方 100MB/50 页；兼容接口走 Base64，这里卡 20MB 以免打爆内存 */
export const OCR_PDF_RAW_MAX = 20 * 1024 * 1024;
export const OCR_PDF_PAGE_MAX = 50;

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

export async function ocrPdfWithQwen(
  env: QwenOcrEnv,
  opts: {
    bytes: Uint8Array;
    fileName: string;
    fetchImpl?: FetchLike;
    maxPages?: number;
  },
): Promise<QwenOcrResult> {
  try {
    if (opts.bytes.byteLength === 0) {
      return { text: "", ok: false, warning: `${opts.fileName} 是空 PDF，无法 OCR。` };
    }
    if (opts.bytes.byteLength > OCR_PDF_RAW_MAX) {
      return {
        text: "",
        ok: false,
        warning: `${opts.fileName} 约 ${(opts.bytes.byteLength / 1024 / 1024).toFixed(1)} MB，扫描 PDF OCR 当前按 Base64 传输，请将文件压到 ${OCR_PDF_RAW_MAX / 1024 / 1024}MB 以内（官方上限 100MB/50 页）。`,
      };
    }
    const { key, base, model } = await resolvedKeyBase(env);
    const fetchImpl = opts.fetchImpl ?? fetch;
    const b64 = uint8ToBase64(opts.bytes);
    const dataUrl = `data:application/pdf;base64,${b64}`;
    const maxPages = Math.min(opts.maxPages ?? OCR_PDF_PAGE_MAX, OCR_PDF_PAGE_MAX);
    const tasks = ["document_parsing", "text_recognition"] as const;
    const warnings: string[] = [];
    for (const task of tasks) {
      const body = {
        model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: opts.fileName || "document.pdf",
                file_data: dataUrl,
              },
              { type: "input_text", text: PDF_PROMPT },
            ],
          },
        ],
        ocr_options: {
          task,
          task_config: { max_pages: maxPages },
        },
      };
      const res = await fetchImpl(`${base}/responses`, {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: "", ok: false, warning: `${opts.fileName} PDF OCR 失败：${msg}` };
  }
}
