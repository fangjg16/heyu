import type { AppObjectStorage } from "./app-storage";
import type { AppDatabase } from "./app-database";
import { documentAccessError, type DocumentRow } from "./documents-access";
import { ingestExistingDocumentBytes, replaceDocumentChunks, shouldEmbedNow, shouldQueueParse } from "./documents-ingest";
import { embedDocumentChunks } from "./embeddings";
import { copyOwnedBytes, looksLikeOcrGaveUp, looksLikeUnparsedPlaceholder } from "./extract-document-text";
import { isImageFileName, isPdfFileName } from "./file-mime";
import { callLlm, type LlmClientEnv } from "./llm-client";
import { getProjectById } from "./projects-db";
import { decodePathProjectId } from "./projects-resolve";
import { canonicalizeFileTopic } from "./file-topic";
import { canDownloadProjectFile, resolveProjectRole, roleCanViewAllSessionUploads } from "./workspace-roles";
import {
  extractSummaryField,
  looksLikeOcrEmptyLlmSummary,
  looksLikeRawParseJson,
  normalizeParseSummaryText,
  parseSummaryRefreshRequested,
  shouldRefreshCachedSummary,
  truncateSummary,
} from "./parse-summary-text";
import {
  visionImagesFromFileBytes,
  type ChatVisionImage,
} from "./chat-vision";
import {
  buildSourceFileParseMessages,
  sourceParseVisionLlmOptions,
} from "./source-parse-vision";

type Env = { DB: AppDatabase; FILES: AppObjectStorage } & LlmClientEnv;

const SOURCE_MAX = 12_000;
const DIRECTORY_MIME = "application/x-directory";

type ParseResultRow = {
  document_id: string;
  summary: string;
  document_type: string | null;
  key_points_json: string | null;
  refs_json: string | null;
  used_for_json: string | null;
  chunk_count: number;
  llm_backend: string | null;
  parsed_at: string;
  updated_at: string;
};

export type DocumentParsePayload = {
  summary: string;
  documentType: string;
  keyPoints: string[];
  refs: string[];
  usedFor: string[];
  chunkCount: number;
  llmBackend?: string | null;
  fromCache?: boolean;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeUserId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim();
  return id.length > 0 ? id : null;
}

function truncateSource(text: string, max = SOURCE_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n…（正文已截断）`;
}

async function loadRowVisionImages(
  env: Env,
  row: { filename: string; mime: string | null; r2_key: string | null },
): Promise<ChatVisionImage[]> {
  if (!row.r2_key) return [];
  if (!isImageFileName(row.filename, row.mime) && !isPdfFileName(row.filename, row.mime)) {
    return [];
  }
  const object = await env.FILES.get(row.r2_key);
  if (!object) return [];
  const bytes = copyOwnedBytes(await object.arrayBuffer());
  return visionImagesFromFileBytes({
    fileName: row.filename,
    mime: row.mime,
    bytes,
  });
}

function looksLikeNoisyLabel(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (t.length > 24) return true;
  if (/https?:\/\//i.test(t)) return true;
  if (/\.(com|ai|io|org|net|cn)\b/i.test(t)) return true;
  if (/\[[A-Za-z]+\d*\]/.test(t)) return true;
  if (/\*\*|`/.test(t)) return true;
  return false;
}

function sanitizeTopicLabels(items: string[], max = 6): string[] {
  return items.filter((s) => !looksLikeNoisyLabel(s)).slice(0, max);
}

function parseStringArray(raw: unknown, max = 6): string[] {
  if (!Array.isArray(raw)) return [];
  return sanitizeTopicLabels(
    raw.map((x) => String(x ?? "").trim()).filter(Boolean),
    max,
  );
}

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    return parseStringArray(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function stripJsonFence(raw: string): string {
  let t = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/iu.exec(t);
  if (fenced?.[1]) t = fenced[1].trim();
  return t;
}

function parseLlmDocumentJson(answer: string): {
  summary: string;
  documentType: string;
  keyPoints: string[];
  refs: string[];
  usedFor: string[];
} {
  const cleaned = stripJsonFence(answer);
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const slice =
      start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
    const obj = JSON.parse(slice) as {
      summary?: unknown;
      documentType?: unknown;
      keyPoints?: unknown;
      refs?: unknown;
      usedFor?: unknown;
    };
    const summaryRaw = String(obj.summary ?? "").trim();
    const summary = /https?:\/\//i.test(summaryRaw)
      ? "未能生成可用摘要，请直接预览原文。"
      : truncateSummary(summaryRaw);
    const documentType = String(obj.documentType ?? "").trim().slice(0, 128);
    const keyPoints = parseStringArray(obj.keyPoints);
    const refs = parseStringArray(obj.refs);
    const usedFor = parseStringArray(obj.usedFor);
    if (summary) {
      return { summary, documentType, keyPoints, refs, usedFor };
    }
  } catch {
    /* fall through */
  }
  const extracted = extractSummaryField(cleaned);
  if (extracted) {
    return {
      summary: /https?:\/\//i.test(extracted)
        ? "未能生成可用摘要，请直接预览原文。"
        : truncateSummary(extracted),
      documentType: "",
      keyPoints: [],
      refs: [],
      usedFor: [],
    };
  }
  if (looksLikeRawParseJson(cleaned)) {
    return {
      summary: "未能生成可用摘要，请直接预览原文。",
      documentType: "",
      keyPoints: [],
      refs: [],
      usedFor: [],
    };
  }
  const fallback = /https?:\/\//i.test(cleaned)
    ? "未能生成可用摘要，请直接预览原文。"
    : cleaned || "模型未返回有效摘要。";
  return {
    summary: truncateSummary(fallback),
    documentType: "",
    keyPoints: [],
    refs: [],
    usedFor: [],
  };
}

function rowToPayload(row: ParseResultRow): DocumentParsePayload {
  return {
    summary: normalizeParseSummaryText(row.summary || "—"),
    documentType: (row.document_type ?? "").trim(),
    keyPoints: parseJsonStringArray(row.key_points_json),
    refs: parseJsonStringArray(row.refs_json),
    usedFor: parseJsonStringArray(row.used_for_json),
    chunkCount: Number(row.chunk_count) || 0,
    llmBackend: row.llm_backend,
    fromCache: true,
  };
}

async function loadParseResult(
  env: Env,
  docId: string,
): Promise<ParseResultRow | null> {
  try {
    return await env.DB.prepare(
      `SELECT document_id, summary, document_type, key_points_json, refs_json, used_for_json,
              chunk_count, llm_backend, parsed_at, updated_at
       FROM document_parse_results WHERE document_id = ?`,
    )
      .bind(docId)
      .first<ParseResultRow>();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /no such table:\s*document_parse_results/i.test(msg) ||
      /Unknown table ['`]?document_parse_results['`]?/i.test(msg)
    ) {
      return null;
    }
    throw e;
  }
}

async function upsertParseResult(
  env: Env,
  docId: string,
  payload: DocumentParsePayload,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await loadParseResult(env, docId);
  const parsedAt = existing?.parsed_at || now;
  await env.DB.prepare(
    `INSERT INTO document_parse_results (
       document_id, summary, document_type, key_points_json, refs_json, used_for_json,
       chunk_count, llm_backend, parsed_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       summary = VALUES(summary),
       document_type = VALUES(document_type),
       key_points_json = VALUES(key_points_json),
       refs_json = VALUES(refs_json),
       used_for_json = VALUES(used_for_json),
       chunk_count = VALUES(chunk_count),
       llm_backend = VALUES(llm_backend),
       updated_at = VALUES(updated_at)`,
  )
    .bind(
      docId,
      truncateSummary(normalizeParseSummaryText(payload.summary)),
      payload.documentType || null,
      JSON.stringify(payload.keyPoints ?? []),
      JSON.stringify(payload.refs ?? []),
      JSON.stringify(payload.usedFor ?? []),
      payload.chunkCount,
      payload.llmBackend ?? null,
      parsedAt,
      now,
    )
    .run();
  await refreshFileCategoryFromParse(env, docId, payload.documentType);
}

/** 解析得到的文件类型写入 file_category（已有人工分类则不覆盖） */
async function refreshFileCategoryFromParse(
  env: Env,
  docId: string,
  documentType: string,
): Promise<void> {
  const topic = documentType.trim().slice(0, 128);
  if (!topic) return;
  try {
    await env.DB.prepare(
      `UPDATE documents SET file_category = ?
       WHERE id = ? AND (file_category IS NULL OR file_category = '')`,
    )
      .bind(topic, docId)
      .run();
  } catch {
    /* 未迁移 file_category 时忽略 */
  }
}

async function loadExistingSourceText(
  env: Env,
  docId: string,
): Promise<{ text: string; chunkCount: number } | null> {
  const q = await env.DB.prepare(
    `SELECT chunk_index, text FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC LIMIT 40`,
  )
    .bind(docId)
    .all<{ chunk_index: number; text: string }>();
  const rows = q.results ?? [];
  if (rows.length === 0) return null;
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM chunks WHERE document_id = ?`,
  )
    .bind(docId)
    .first<{ c: number }>();
  const chunkCount = Number(countRow?.c) || rows.length;
  const joined = rows.map((r) => r.text).join("\n\n");
  return { text: joined, chunkCount };
}

async function extractAndPersistSource(
  env: Env,
  ctx: ExecutionContext,
  row: DocumentRow & { mime: string | null; relative_path?: string | null },
  userId: string,
  projectId: string,
): Promise<{ text: string; chunkCount: number; warning?: string; ok: boolean }> {
  if (!row.r2_key) {
    return {
      text: "文件对象不存在，无法解析。",
      chunkCount: 0,
      ok: false,
    };
  }
  const object = await env.FILES.get(row.r2_key);
  if (!object) {
    return {
      text: "对象存储中找不到文件，无法解析。",
      chunkCount: 0,
      ok: false,
    };
  }
  const bytes = await object.arrayBuffer();
  const ingested = await ingestExistingDocumentBytes(env, {
    docId: row.id,
    projectId,
    uploadedBy: row.uploaded_by ?? userId,
    conversationId: row.conversation_id,
    scope: row.scope,
    fileName: row.filename,
    mime: row.mime,
    bytes,
    relativePath: row.relative_path ?? "",
    allowOcr: true,
    persistAttachments: true,
  });
  for (const job of ingested.jobs) {
    if (shouldEmbedNow(job)) {
      ctx.waitUntil(embedDocumentChunks(env, job.documentId));
    }
    if (job.documentId !== row.id && shouldQueueParse(job) && !job.needsOcr) {
      ctx.waitUntil(
        runDocumentParseSummaryBackground(env, ctx, {
          projectId,
          documentId: job.documentId,
          userId,
        }),
      );
    }
  }
  return {
    text: ingested.text,
    chunkCount: ingested.chunkCount,
    warning: ingested.warning,
    ok: ingested.parsed && !ingested.needsOcr && !looksLikeUnparsedPlaceholder(ingested.text),
  };
}

function parseResponseBody(
  row: DocumentRow & { mime: string | null },
  payload: DocumentParsePayload,
  extra?: { warning?: string | null; parsed?: boolean },
) {
  return {
    documentId: row.id,
    filename: row.filename,
    mime: row.mime,
    parsed: extra?.parsed ?? true,
    summary: payload.summary,
    documentType: payload.documentType,
    keyPoints: payload.keyPoints,
    refs: payload.refs,
    usedFor: payload.usedFor,
    chunkCount: payload.chunkCount,
    llmBackend: payload.llmBackend ?? null,
    fromCache: Boolean(payload.fromCache),
    warning: extra?.warning ?? null,
  };
}

const PARSE_INFLIGHT = new Map<string, Promise<Response>>();

/** GET /api/projects/:projectId/files/:docId/parse-summary?userId=&refresh=1 */
export async function handleParseProjectFileSummary(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathProjectId: string,
  docId: string,
): Promise<Response> {
  const projectId = decodePathProjectId(pathProjectId);
  const id = docId.trim();
  const lockKey = `${projectId}:${id}`;
  const existingLock = PARSE_INFLIGHT.get(lockKey);
  if (existingLock) {
    const res = await existingLock;
    return res.clone();
  }
  const run = handleParseProjectFileSummaryUnlocked(
    request,
    env,
    ctx,
    pathProjectId,
    docId,
  );
  PARSE_INFLIGHT.set(lockKey, run);
  try {
    return await run;
  } finally {
    if (PARSE_INFLIGHT.get(lockKey) === run) PARSE_INFLIGHT.delete(lockKey);
  }
}

async function handleParseProjectFileSummaryUnlocked(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathProjectId: string,
  docId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = normalizeUserId(url.searchParams.get("userId"));
  if (!userId) return json({ error: "缺少 userId 查询参数" }, 400);
  const forceRefresh = parseSummaryRefreshRequested(url.searchParams);

  const projectId = decodePathProjectId(pathProjectId);
  const id = docId.trim();
  if (!id) return json({ error: "缺少 documentId" }, 400);

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  let row: (DocumentRow & {
    mime: string | null;
    deleted_at?: string | null;
    relative_path?: string | null;
  }) | null = null;
  try {
    row = await env.DB.prepare(
      `SELECT id, project_id, filename, relative_path, scope, conversation_id, uploaded_by, r2_key, mime, deleted_at
       FROM documents WHERE id = ? AND project_id = ?`,
    )
      .bind(id, projectId)
      .first<DocumentRow & { mime: string | null; deleted_at?: string | null; relative_path?: string | null }>();
  } catch {
    try {
      row = await env.DB.prepare(
        `SELECT id, project_id, filename, relative_path, scope, conversation_id, uploaded_by, r2_key, mime
         FROM documents WHERE id = ? AND project_id = ?`,
      )
        .bind(id, projectId)
        .first<DocumentRow & { mime: string | null; relative_path?: string | null }>();
    } catch {
      row = await env.DB.prepare(
        `SELECT id, project_id, filename, scope, conversation_id, uploaded_by, r2_key, mime
         FROM documents WHERE id = ? AND project_id = ?`,
      )
        .bind(id, projectId)
        .first<DocumentRow & { mime: string | null }>();
    }
  }

  if (!row || (row.deleted_at != null && String(row.deleted_at).trim() !== "")) {
    return json({ error: "文件不存在或已删除" }, 404);
  }

  if (
    row.filename === ".keep" ||
    (row.mime ?? "").trim() === DIRECTORY_MIME
  ) {
    return json({
      documentId: id,
      filename: row.filename,
      mime: row.mime,
      parsed: false,
      summary: "文件夹占位，无需解析。",
      chunkCount: 0,
      documentType: "",
      keyPoints: [],
      refs: [],
      usedFor: [],
    });
  }

  const role = await resolveProjectRole(
    env,
    userId,
    projectId,
    project.createdBy,
  );
  const accessErr = documentAccessError(row, userId, {
    viewAllSession: roleCanViewAllSessionUploads(role),
  });
  if (accessErr) return json({ error: accessErr }, 403);

  if (row.scope === "package") {
    const allowed = await canDownloadProjectFile(
      env,
      userId,
      projectId,
      project.createdBy,
    );
    if (!allowed) {
      return json({ error: "仅 Admin、Core 或项目创建人可解析资料包文件" }, 403);
    }
  }

  const cached = await loadParseResult(env, id);
  if (cached && !forceRefresh && !shouldRefreshCachedSummary(cached.summary)) {
    return json(parseResponseBody(row, rowToPayload(cached)));
  }

  let visionImages: ChatVisionImage[] = [];
  try {
    visionImages = await loadRowVisionImages(env, row);
  } catch {
    visionImages = [];
  }
  const useVision = visionImages.length > 0;

  let sourceText = "";
  let chunkCount = 0;
  let extractWarning: string | undefined;

  const existing = await loadExistingSourceText(env, id);
  const retryOcrAfterLlmLie = Boolean(
    cached && looksLikeOcrEmptyLlmSummary(cached.summary),
  );
  const existingIsOcrGiveUp = Boolean(existing && looksLikeOcrGaveUp(existing.text));
  const existingUsable =
    Boolean(existing) &&
    !looksLikeUnparsedPlaceholder(existing!.text) &&
    !looksLikeOcrGaveUp(existing!.text);
  /** 无文字层扫描件/图片：跳过 OCR，直接看图 */
  const shouldReextract =
    !useVision &&
    (!existing ||
      looksLikeUnparsedPlaceholder(existing.text) ||
      (existingIsOcrGiveUp && retryOcrAfterLlmLie));

  if (useVision) {
    if (existingUsable && existing) {
      sourceText = existing.text;
      chunkCount = existing.chunkCount;
    } else if (existing) {
      sourceText = "";
      chunkCount = existing.chunkCount;
    }
  } else if (existing && !shouldReextract) {
    sourceText = existing.text;
    chunkCount = existing.chunkCount;
  } else {
    const extracted = await extractAndPersistSource(
      env,
      ctx,
      row,
      userId,
      projectId,
    );
    sourceText = extracted.text;
    chunkCount = extracted.chunkCount;
    extractWarning = extracted.warning;
    const extractEmpty =
      !extracted.ok ||
      looksLikeOcrGaveUp(sourceText) ||
      looksLikeUnparsedPlaceholder(sourceText);
    if (extractEmpty && !useVision) {
      if (looksLikeOcrGaveUp(sourceText)) {
        try {
          await upsertParseResult(env, id, {
            summary: truncateSummary(sourceText),
            documentType: "",
            keyPoints: [],
            refs: [],
            usedFor: [],
            chunkCount,
          });
        } catch {
          /* 未建 document_parse_results 时仍返回失败文案 */
        }
      }
      return json({
        documentId: id,
        filename: row.filename,
        mime: row.mime,
        parsed: false,
        summary: sourceText.trim() || "暂未解析正文，无法调用大模型。",
        chunkCount,
        documentType: "",
        keyPoints: [],
        refs: [],
        usedFor: [],
        warning: extractWarning ?? null,
      });
    }
  }

  if (
    !useVision &&
    (!sourceText.trim() ||
      looksLikeUnparsedPlaceholder(sourceText) ||
      looksLikeOcrGaveUp(sourceText))
  ) {
    return json({
      documentId: id,
      filename: row.filename,
      mime: row.mime,
      parsed: false,
      summary: sourceText.trim() || "暂未解析正文，无法调用大模型。",
      chunkCount,
      documentType: "",
      keyPoints: [],
      refs: [],
      usedFor: [],
      warning: extractWarning ?? null,
    });
  }

  try {
    const messages = buildSourceFileParseMessages({
      filename: row.filename,
      mime: row.mime,
      sourceText: truncateSource(sourceText),
      images: visionImages,
    });
    const { answer, llmBackend } = await callLlm(
      env,
      messages,
      useVision ? sourceParseVisionLlmOptions(env) : undefined,
    );
    const parsed = parseLlmDocumentJson(answer);
    let nextChunkCount = chunkCount;
    const junkChunks =
      useVision &&
      (!sourceText.trim() ||
        looksLikeUnparsedPlaceholder(sourceText) ||
        looksLikeOcrGaveUp(sourceText));
    if (junkChunks) {
      const digest = [
        `【${row.filename} · 视觉理解】`,
        parsed.summary,
        ...parsed.keyPoints,
      ]
        .filter(Boolean)
        .join("\n");
      try {
        nextChunkCount = await replaceDocumentChunks(env, id, digest);
      } catch {
        /* chunks 表异常时仍返回摘要 */
      }
    }
    const payload: DocumentParsePayload = {
      summary: parsed.summary,
      documentType: canonicalizeFileTopic(parsed.documentType, row.filename),
      keyPoints: parsed.keyPoints,
      refs: parsed.refs,
      usedFor: parsed.usedFor,
      chunkCount: nextChunkCount,
      llmBackend,
      fromCache: false,
    };
    try {
      await upsertParseResult(env, id, payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        /no such table:\s*document_parse_results/i.test(msg) ||
        /Unknown table ['`]?document_parse_results['`]?/i.test(msg)
      ) {
        return json({
          ...parseResponseBody(row, payload, { warning: extractWarning ?? null }),
          persistError:
            "解析成功但未落库：请执行 migration 0014（document_parse_results）",
        });
      }
      throw e;
    }
    return json(
      parseResponseBody(row, payload, { warning: extractWarning ?? null }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (cached && !looksLikeOcrGaveUp(cached.summary)) {
      return json(parseResponseBody(row, rowToPayload(cached)));
    }
    const failSummary = useVision
      ? `视觉理解未能读出图面：${msg}`
      : `大模型解析失败：${msg}`;
    try {
      await upsertParseResult(env, id, {
        summary: truncateSummary(failSummary),
        documentType: "",
        keyPoints: [],
        refs: [],
        usedFor: [],
        chunkCount,
      });
    } catch {
      /* ignore persist */
    }
    return json({
      documentId: id,
      filename: row.filename,
      mime: row.mime,
      parsed: false,
      summary: failSummary,
      chunkCount,
      documentType: "",
      keyPoints: [],
      refs: [],
      usedFor: [],
      warning: extractWarning ?? null,
    });
  }
}

/** 上传后后台解析；失败不影响上传结果 */
export async function runDocumentParseSummaryBackground(
  env: Env,
  ctx: ExecutionContext,
  opts: { projectId: string; documentId: string; userId: string },
): Promise<void> {
  const userId = opts.userId.trim();
  const documentId = opts.documentId.trim();
  if (!userId || !documentId) return;
  try {
    const req = new Request(
      `https://jfo.local/parse-summary?userId=${encodeURIComponent(userId)}`,
    );
    await handleParseProjectFileSummary(
      req,
      env,
      ctx,
      opts.projectId,
      documentId,
    );
  } catch {
    /* ignore */
  }
}
