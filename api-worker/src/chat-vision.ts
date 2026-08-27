import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
import { documentAccessError, type DocumentRow } from "./documents-access";
import {
  copyOwnedBytes,
  looksLikeUnparsedPlaceholder,
} from "./extract-document-text";
import { isImageFileName, isPdfFileName } from "./file-mime";
import type { LlmContentPart, LlmMessage } from "./llm-client";
import { getProjectById } from "./projects-db";
import { extractPdfPlainText } from "./pdf-text";
import { encodePngRgba } from "./png-encode";
import { uint8ToBase64 } from "./qwen-ocr";
import { resolveProjectRole, roleCanViewAllSessionUploads } from "./workspace-roles";
import { extractImages, getDocumentProxy } from "unpdf";

export const QWEN_VL_MODEL_DEFAULT = "qwen3-vl-plus";
export const VL_IMAGE_RAW_MAX = 7 * 1024 * 1024;
/** 扫描 PDF 整份送给 VL（抽不出页图时） */
export const VL_PDF_RAW_MAX = 12 * 1024 * 1024;
export const VL_MAX_IMAGES = 8;
export const VL_MAX_PDF_PAGES = 8;

export type ChatVisionImage = {
  dataUrl: string;
  label: string;
  /** 抽不出页图时，把扫描 PDF 整份按 file 传给千问视觉 */
  asFile?: boolean;
};

export type ChatVisionResult = {
  images: ChatVisionImage[];
  labels: string[];
};

const VL_LOOK_HINT =
  "\n\n【看图】以上为用户指定的扫描件/图片，请直接阅读图面（注记、编号、四至、图例、几何关系），不要只根据文件名或 OCR 失败摘要臆测。";

export function vlModelName(env: { QWEN_VL_MODEL?: string } | null | undefined): string {
  return (env?.QWEN_VL_MODEL || QWEN_VL_MODEL_DEFAULT).trim() || QWEN_VL_MODEL_DEFAULT;
}

export function attachVisionToLastUserMessage(
  messages: LlmMessage[],
  images: ChatVisionImage[],
): LlmMessage[] {
  if (images.length === 0) return messages;
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return messages;
  const text =
    (typeof last.content === "string" ? last.content : "") + VL_LOOK_HINT;
  const parts: LlmContentPart[] = [
    ...images.map((img) =>
      img.asFile
        ? {
            type: "file" as const,
            file: { filename: img.label, file_data: img.dataUrl },
          }
        : {
            type: "image_url" as const,
            image_url: { url: img.dataUrl },
          },
    ),
    { type: "text", text },
  ];
  return messages.map((m) => (m === last ? { ...m, content: parts } : m));
}

function guessMime(fileName: string, mime: string | null | undefined): string {
  const m = (mime || "").split(";")[0]!.trim();
  if (m.startsWith("image/")) return m;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".jpe")) {
    return "image/jpeg";
  }
  return "image/jpeg";
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${uint8ToBase64(bytes)}`;
}

function asPixelBytes(data: ArrayLike<number>): Uint8Array {
  return data instanceof Uint8Array ? data : Uint8Array.from(data);
}

async function pdfPagesAsPng(bytes: Uint8Array, fileName: string): Promise<ChatVisionImage[]> {
  const owned = copyOwnedBytes(bytes);
  const pdf = await getDocumentProxy(copyOwnedBytes(owned));
  const n = Math.min(pdf.numPages || 1, VL_MAX_PDF_PAGES);
  const out: ChatVisionImage[] = [];
  for (let page = 1; page <= n && out.length < VL_MAX_IMAGES; page++) {
    let images: Array<{
      data: ArrayLike<number>;
      width: number;
      height: number;
      channels: 1 | 3 | 4;
    }>;
    try {
      images = await extractImages(pdf, page);
    } catch {
      continue;
    }
    for (const img of images) {
      if (out.length >= VL_MAX_IMAGES) break;
      const ch = img.channels;
      if (ch !== 1 && ch !== 3 && ch !== 4) continue;
      try {
        const png = await encodePngRgba(img.width, img.height, asPixelBytes(img.data), ch);
        if (png.byteLength === 0 || png.byteLength > VL_IMAGE_RAW_MAX) continue;
        out.push({
          dataUrl: toDataUrl(png, "image/png"),
          label: n > 1 ? `${fileName} 第${page}页` : fileName,
        });
      } catch {
        /* skip undecodable xobject */
      }
    }
  }
  return out;
}

type VisionEnv = {
  DB: AppDatabase;
  FILES: AppObjectStorage;
};

async function loadRowsByIds(
  env: VisionEnv,
  projectId: string,
  ids: string[],
): Promise<DocumentRow[]> {
  const out: DocumentRow[] = [];
  for (const id of ids) {
    try {
      const row = await env.DB.prepare(
        `SELECT id, filename, mime, r2_key, scope, uploaded_by, conversation_id
         FROM documents WHERE id = ? AND project_id = ?
           AND (deleted_at IS NULL OR deleted_at = '')`,
      )
        .bind(id, projectId)
        .first<DocumentRow>();
      if (row) out.push(row);
    } catch {
      const row = await env.DB.prepare(
        `SELECT id, filename, mime, r2_key, scope, uploaded_by, conversation_id
         FROM documents WHERE id = ? AND project_id = ?`,
      )
        .bind(id, projectId)
        .first<DocumentRow>();
      if (row) out.push(row);
    }
  }
  return out;
}

async function loadRowsByFilenames(
  env: VisionEnv,
  projectId: string,
  names: string[],
): Promise<DocumentRow[]> {
  const out: DocumentRow[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const n = name.trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    try {
      const row = await env.DB.prepare(
        `SELECT id, filename, mime, r2_key, scope, uploaded_by, conversation_id
         FROM documents WHERE project_id = ? AND filename = ?
           AND (deleted_at IS NULL OR deleted_at = '')
         ORDER BY created_at DESC LIMIT 1`,
      )
        .bind(projectId, n)
        .first<DocumentRow>();
      if (row) out.push(row);
    } catch {
      const row = await env.DB.prepare(
        `SELECT id, filename, mime, r2_key, scope, uploaded_by, conversation_id
         FROM documents WHERE project_id = ? AND filename = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
        .bind(projectId, n)
        .first<DocumentRow>();
      if (row) out.push(row);
    }
  }
  return out;
}

async function canView(
  env: VisionEnv,
  projectId: string,
  userId: string,
  row: DocumentRow,
): Promise<boolean> {
  const project = await getProjectById(env, projectId);
  let viewAllSession = false;
  if (project) {
    const role = await resolveProjectRole(env, userId, projectId, project.createdBy);
    viewAllSession = roleCanViewAllSessionUploads(role);
  }
  return !documentAccessError(row, userId, { viewAllSession });
}

/** 图片，或无文字层的扫描 PDF：抽出页图（或整份 PDF）给视觉模型 */
export async function visionImagesFromFileBytes(opts: {
  fileName: string;
  mime?: string | null;
  bytes: Uint8Array;
}): Promise<ChatVisionImage[]> {
  const fileName = opts.fileName;
  const mime = opts.mime ?? null;
  const bytes = copyOwnedBytes(opts.bytes);
  if (bytes.byteLength === 0) return [];
  const images: ChatVisionImage[] = [];

  if (isImageFileName(fileName, mime)) {
    if (bytes.byteLength > VL_IMAGE_RAW_MAX) return [];
    return [
      {
        dataUrl: toDataUrl(bytes, guessMime(fileName, mime)),
        label: fileName,
      },
    ];
  }

  if (!isPdfFileName(fileName, mime)) return [];

  const local = await extractPdfPlainText(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    fileName,
  );
  const needVision =
    !local.parsed ||
    !local.text.trim() ||
    looksLikeUnparsedPlaceholder(local.text);
  if (!needVision) return [];

  const pages = await pdfPagesAsPng(bytes, fileName);
  if (pages.length > 0) return pages.slice(0, VL_MAX_IMAGES);
  if (bytes.byteLength > VL_PDF_RAW_MAX) return [];
  return [
    {
      dataUrl: toDataUrl(bytes, "application/pdf"),
      label: fileName,
      asFile: true,
    },
  ];
}

export async function collectChatVisionImages(
  env: VisionEnv,
  opts: {
    projectId: string;
    userId: string;
    fileIds?: string[] | null;
    files?: string[] | null;
  },
): Promise<ChatVisionResult> {
  const ids = [...new Set((opts.fileIds ?? []).map((s) => String(s).trim()).filter(Boolean))];
  const names = [...new Set((opts.files ?? []).map((s) => String(s).trim()).filter(Boolean))];
  if (ids.length === 0 && names.length === 0) {
    return { images: [], labels: [] };
  }

  const byId = await loadRowsByIds(env, opts.projectId, ids);
  const have = new Set(byId.map((r) => r.filename));
  const missingNames = names.filter((n) => !have.has(n));
  const byName = missingNames.length
    ? await loadRowsByFilenames(env, opts.projectId, missingNames)
    : [];
  const rows: DocumentRow[] = [];
  const seenId = new Set<string>();
  for (const row of [...byId, ...byName]) {
    if (seenId.has(row.id)) continue;
    seenId.add(row.id);
    if (!(await canView(env, opts.projectId, opts.userId, row))) continue;
    rows.push(row);
  }

  const images: ChatVisionImage[] = [];
  for (const row of rows) {
    if (images.length >= VL_MAX_IMAGES) break;
    const isImg = isImageFileName(row.filename, row.mime);
    const isPdf = isPdfFileName(row.filename, row.mime);
    if (!isImg && !isPdf) continue;
    if (!row.r2_key) continue;
    const object = await env.FILES.get(row.r2_key);
    if (!object) continue;
    const bytes = copyOwnedBytes(await object.arrayBuffer());
    const parts = await visionImagesFromFileBytes({
      fileName: row.filename,
      mime: row.mime,
      bytes,
    });
    for (const img of parts) {
      if (images.length >= VL_MAX_IMAGES) break;
      images.push(img);
    }
  }

  return {
    images,
    labels: [...new Set(images.map((i) => i.label))],
  };
}
