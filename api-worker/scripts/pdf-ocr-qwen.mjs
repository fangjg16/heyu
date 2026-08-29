/**
 * 大扫描 PDF 的 OCR 必须在 Node 里跑（workerd 塞 38MB FormData / 按页 POST 会把请求掐死）。
 * Worker 只 POST 一次 PDF 到 /__jfo/internal/ocr-pdf。
 */
import { rasterizePdfPage, PDF_PAGE_PNG_OCR_MAX_PAGES } from "./pdf-pages-png.mjs";

const PDF_PROMPT =
  "请提取该 PDF 中的全部文字、表格与公式，保持阅读顺序。只输出提取结果，不要解释。";
const IMAGE_PROMPT =
  "请提取图中全部文字，保持原有阅读顺序与换行。只输出提取的文字，不要解释、不要markdown围栏。";
const OCR_IMAGE_RAW_MAX = 7 * 1024 * 1024;
const OCR_PDF_OFFICIAL_RAW_MAX = 100 * 1024 * 1024;

function asRecord(v) {
  return v && typeof v === "object" ? v : null;
}

function collectStrings(v, into, depth = 0) {
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

function extractOcrText(raw) {
  const rec = asRecord(raw);
  if (!rec) return "";
  const parts = [];
  collectStrings(rec.ocr_result ?? rec.output_text, parts);
  if (parts.length === 0) collectStrings(raw, parts);
  return [...new Set(parts.map((s) => s.trim()).filter(Boolean))].join("\n\n").trim();
}

async function parseJsonResponse(res, label) {
  const rawText = await res.text();
  let raw = {};
  try {
    raw = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`${label} 返回非 JSON（HTTP ${res.status}）`);
  }
  if (!res.ok) {
    const err =
      raw?.error?.message || raw?.message || raw?.detail || `${label} HTTP ${res.status}`;
    throw new Error(String(err));
  }
  return raw;
}

function parseUploadedFileId(raw) {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = typeof rec.id === "string" ? rec.id.trim() : "";
  if (id) return id;
  const data = asRecord(rec.data);
  const nested = typeof data?.id === "string" ? data.id.trim() : "";
  return nested || null;
}

function dataUrlToBytes(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/u.exec(dataUrl);
  if (!m) return null;
  const mime = (m[1] || "image/png").trim() || "image/png";
  const buf = Buffer.from(m[2] || "", "base64");
  return { mime, bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
}

async function ocrViaResponses(opts) {
  const { key, base, model, fileName, maxPages, filePart } = opts;
  const tasks = ["document_parsing", "text_recognition"];
  const warnings = [];
  for (const task of tasks) {
    const res = await fetch(`${base}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [filePart, { type: "input_text", text: PDF_PROMPT }],
          },
        ],
        ocr_options: {
          task,
          task_config: { max_pages: maxPages },
        },
      }),
    });
    try {
      const raw = await parseJsonResponse(res, "qwen3.5-ocr PDF");
      const text = extractOcrText(raw);
      if (text) return { text, ok: true };
      warnings.push(`${task} 未返回文字`);
    } catch (e) {
      warnings.push(`${task}：${e?.message ?? e}`);
    }
  }
  return {
    text: "",
    ok: false,
    warning: `${fileName} PDF OCR 未返回文字（${warnings.join("；")}）。`,
  };
}

async function ocrViaFileUpload(opts) {
  const { key, base, model, fileName, bytes, maxPages } = opts;
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: "application/pdf" }),
    fileName || "document.pdf",
  );
  form.append("purpose", "file-extract");
  const up = await fetch(`${base}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const raw = await parseJsonResponse(up, "qwen3.5-ocr 上传 PDF");
  const fileId = parseUploadedFileId(raw);
  if (!fileId) {
    return { text: "", ok: false, warning: `${fileName} 上传百炼后未返回 file_id。` };
  }
  const rec = asRecord(raw);
  const fileUrl =
    (typeof rec?.url === "string" && rec.url.trim()) ||
    (typeof asRecord(rec?.data)?.url === "string" && String(asRecord(rec.data).url).trim()) ||
    "";
  const parts = [
    { type: "input_file", filename: fileName || "document.pdf", file_id: fileId },
  ];
  if (fileUrl) {
    parts.unshift({
      type: "input_file",
      filename: fileName || "document.pdf",
      file_url: fileUrl,
    });
  }
  const warnings = [];
  for (const filePart of parts) {
    const r = await ocrViaResponses({
      key,
      base,
      model,
      fileName,
      maxPages,
      filePart,
    });
    if (r.ok && r.text.trim()) return r;
    if (r.warning) warnings.push(r.warning);
  }
  return {
    text: "",
    ok: false,
    warning: warnings[0] || `${fileName} 已上传百炼，但 OCR 未返回文字。`,
  };
}

async function ocrImage(opts) {
  const { key, base, model, bytes, fileName, mime } = opts;
  if (bytes.byteLength === 0 || bytes.byteLength > OCR_IMAGE_RAW_MAX) return null;
  const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  const res = await fetch(`${base}/chat/completions`, {
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
    }),
  });
  const raw = await parseJsonResponse(res, "qwen3.5-ocr 图片");
  const text = extractOcrText(raw);
  return text ? { text, ok: true } : null;
}

async function ocrViaPages(opts) {
  const { key, base, model, fileName, bytes, maxPages, pageCount } = opts;
  const cap = Math.min(
    Math.max(1, Number(pageCount) || maxPages || PDF_PAGE_PNG_OCR_MAX_PAGES),
    maxPages,
    PDF_PAGE_PNG_OCR_MAX_PAGES,
  );
  const parts = [];
  const pageWarnings = [];
  for (let page = 1; page <= cap; page++) {
    let image = null;
    try {
      const rendered = await rasterizePdfPage(bytes, { page, width: 1400 });
      image = dataUrlToBytes(rendered.dataUrl);
    } catch (e) {
      pageWarnings.push(`第${page}页渲染失败：${e?.message ?? e}`);
      continue;
    }
    if (!image || image.bytes.byteLength === 0) {
      pageWarnings.push(`第${page}页没有图像`);
      continue;
    }
    try {
      const r = await ocrImage({
        key,
        base,
        model,
        bytes: image.bytes,
        fileName: `${fileName}#${page}`,
        mime: image.mime,
      });
      if (r?.ok && r.text.trim()) {
        parts.push(cap > 1 ? `【第${page}页】\n${r.text.trim()}` : r.text.trim());
      }
    } catch (e) {
      pageWarnings.push(`第${page}页：${e?.message ?? e}`);
    }
  }
  if (parts.length === 0) {
    return {
      text: "",
      ok: false,
      warning:
        `${fileName} 已按页 OCR 但未抽出文字。` +
        (pageWarnings.length ? `（${pageWarnings.slice(0, 3).join("；")}）` : ""),
    };
  }
  return { text: parts.join("\n\n"), ok: true };
}

/**
 * @param {Uint8Array | Buffer} bytes
 * @param {{ apiKey: string, base: string, model: string, fileName?: string, maxPages?: number, pageCount?: number }} opts
 */
export async function ocrLargePdfInNode(bytes, opts) {
  const owned = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const fileName = String(opts.fileName || "document.pdf").trim() || "document.pdf";
  if (owned.byteLength === 0) {
    return { text: "", ok: false, warning: `${fileName} 是空 PDF，无法 OCR。` };
  }
  if (owned.byteLength > OCR_PDF_OFFICIAL_RAW_MAX) {
    return {
      text: "",
      ok: false,
      warning: `${fileName} 约 ${(owned.byteLength / 1024 / 1024).toFixed(1)} MB，超过 qwen3.5-ocr 官方上限 100MB。`,
    };
  }
  const key = String(opts.apiKey || "").trim();
  const base = String(opts.base || "")
    .trim()
    .replace(/\/$/u, "");
  const model = String(opts.model || "qwen3.5-ocr").trim() || "qwen3.5-ocr";
  if (!key || !base) {
    return { text: "", ok: false, warning: `${fileName} 无法 OCR：未配置百炼 API Key。` };
  }
  const maxPages = Math.min(
    Math.max(1, Number(opts.maxPages) || PDF_PAGE_PNG_OCR_MAX_PAGES),
    PDF_PAGE_PNG_OCR_MAX_PAGES,
  );
  const uploaded = await ocrViaFileUpload({
    key,
    base,
    model,
    fileName,
    bytes: owned,
    maxPages,
  }).catch((e) => ({
    text: "",
    ok: false,
    warning: `${fileName} 上传百炼失败：${e?.message ?? e}`,
  }));
  if (uploaded.ok && uploaded.text.trim()) return uploaded;
  const paged = await ocrViaPages({
    key,
    base,
    model,
    fileName,
    bytes: owned,
    maxPages,
    pageCount: opts.pageCount,
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
