import type { AppObjectStorage } from "./app-storage";
import type { AppDatabase } from "./app-database";
import { invalidateChunkCache } from "./chunk-cache";
import { documentAccessError, type DocumentRow } from "./documents-access";
import { embedDocumentChunks } from "./embeddings";
import { callLlm, type LlmClientEnv } from "./llm-client";
import { extractPdfPlainText } from "./pdf-text";
import { getProjectById } from "./projects-db";
import { decodePathProjectId } from "./projects-resolve";
import { chunkPlainText } from "./search";
import { canonicalizeFileTopic } from "./file-topic";
import { extractSpreadsheetPlainText } from "./spreadsheet-text";
import { canDownloadProjectFile, resolveProjectRole, roleCanViewAllSessionUploads } from "./workspace-roles";
import {
  extractSummaryField,
  looksLikeRawParseJson,
  normalizeParseSummaryText,
  shouldRefreshCachedSummary,
  truncateSummary,
} from "./parse-summary-text";

type Env = { DB: AppDatabase; FILES: AppObjectStorage } & LlmClientEnv;

const SOURCE_MAX = 12_000;
const DIRECTORY_MIME = "application/x-directory";

const PARSE_SYSTEM = `你是投研工作台的源文件解析助手。根据给定文件正文摘录，输出 JSON（不要 markdown 围栏，不要其它说明）。
规则：
1. 只依据原文，禁止编造原文未出现的事实、数据、主体或结论。
2. 若信息不足，在 summary 中如实说明「原文未披露…」，不要猜测。
3. 输出唯一 JSON 对象，字段：
{"summary":"不超过220字的投研向摘要","documentType":"必须是下列之一：项目介绍、定位与进展、对标与竞品、行业与市场、财务与估值、法律与合规、股权与主体、尽调材料、其他","keyPoints":["要点"],"refs":["可引用主题"],"usedFor":["投研用途建议"]}
4. summary 必须是完整句子，约 120–220 字，最多 220 个汉字/字符；keyPoints、refs、usedFor 各最多 6 条；无内容用空数组。
5. summary 是 JSON 字符串：内部英文双引号必须写成 \\"，专名优先用「」或『』，禁止未转义的 "。
6. refs=该文件可作为何种证据/主题被引用，必须是不超过 16 字的中文短词（如「竞品定价」「团队背景」）；禁止 URL、域名、脚注编号、原文摘录。
7. usedFor=建议用于哪些投研环节，同样用短词，禁止 URL。
8. documentType 只输出上列短标签本身，禁止用整句文件名或报告标题当类型。`;

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

async function extractPlainTextFromBytes(
  bytes: ArrayBuffer,
  filename: string,
  mime: string | null,
): Promise<{ text: string; parsed: boolean; warning?: string }> {
  const safeName = filename.toLowerCase();
  const m = (mime ?? "").toLowerCase();
  const isText =
    m.startsWith("text/") ||
    safeName.endsWith(".txt") ||
    safeName.endsWith(".md") ||
    safeName.endsWith(".html") ||
    safeName.endsWith(".htm");
  const isPdf = m === "application/pdf" || safeName.endsWith(".pdf");
  const isSpreadsheet =
    m.includes("spreadsheet") ||
    m === "application/vnd.ms-excel" ||
    safeName.endsWith(".xlsx") ||
    safeName.endsWith(".xls");

  if (isText) {
    return { text: new TextDecoder().decode(bytes), parsed: true };
  }
  if (isPdf) {
    const extracted = await extractPdfPlainText(bytes, filename);
    if (extracted.parsed && extracted.text) {
      return {
        text: extracted.text,
        parsed: true,
        warning: extracted.warning,
      };
    }
    return {
      text: `（已上传 PDF：${filename}。${extracted.warning ?? "未能提取正文"}）`,
      parsed: false,
      warning: extracted.warning,
    };
  }
  if (isSpreadsheet) {
    const extracted = await extractSpreadsheetPlainText(bytes, filename);
    if (extracted.parsed && extracted.text) {
      return {
        text: extracted.text,
        parsed: true,
        warning: extracted.warning,
      };
    }
    return {
      text: `（已上传 Excel：${filename}。${extracted.warning ?? "未能提取表格正文"}）`,
      parsed: false,
      warning: extracted.warning,
    };
  }
  return {
    text: `（已上传文件：${filename}，类型 ${mime || "未知"}，暂未解析正文。）`,
    parsed: false,
  };
}

function looksLikePlaceholderText(text: string): boolean {
  const t = text.trim();
  return (
    t.startsWith("（已上传") ||
    t.includes("暂未解析正文") ||
    t.includes("未能提取") ||
    t.includes("请压缩") ||
    /超过\s*\d+\s*MB/u.test(t)
  );
}

async function deleteDocumentChunks(env: Env, docId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM chunks WHERE document_id = ?`)
    .bind(docId)
    .run();
}

async function extractAndPersistSource(
  env: Env,
  ctx: ExecutionContext,
  row: DocumentRow & { mime: string | null },
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
  const extracted = await extractPlainTextFromBytes(
    bytes,
    row.filename,
    row.mime,
  );
  await deleteDocumentChunks(env, row.id);
  const parts = chunkPlainText(extracted.text);
  for (let i = 0; i < parts.length; i++) {
    await env.DB.prepare(
      `INSERT INTO chunks (id, document_id, chunk_index, text) VALUES (?, ?, ?, ?)`,
    )
      .bind(`${row.id}-${i}`, row.id, i, parts[i])
      .run();
  }
  await invalidateChunkCache(
    projectId,
    row.uploaded_by ?? userId,
    row.scope === "session" ? row.conversation_id ?? undefined : undefined,
  );
  if (extracted.parsed && parts.length > 0) {
    ctx.waitUntil(embedDocumentChunks(env, row.id));
  }
  return {
    text: extracted.text,
    chunkCount: parts.length,
    warning: extracted.warning,
    ok: extracted.parsed && !looksLikePlaceholderText(extracted.text),
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

/** GET /api/projects/:projectId/files/:docId/parse-summary?userId= */
export async function handleParseProjectFileSummary(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathProjectId: string,
  docId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = normalizeUserId(url.searchParams.get("userId"));
  if (!userId) return json({ error: "缺少 userId 查询参数" }, 400);

  const projectId = decodePathProjectId(pathProjectId);
  const id = docId.trim();
  if (!id) return json({ error: "缺少 documentId" }, 400);

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  let row: (DocumentRow & {
    mime: string | null;
    deleted_at?: string | null;
  }) | null = null;
  try {
    row = await env.DB.prepare(
      `SELECT id, project_id, filename, scope, conversation_id, uploaded_by, r2_key, mime, deleted_at
       FROM documents WHERE id = ? AND project_id = ?`,
    )
      .bind(id, projectId)
      .first<DocumentRow & { mime: string | null; deleted_at?: string | null }>();
  } catch {
    row = await env.DB.prepare(
      `SELECT id, project_id, filename, scope, conversation_id, uploaded_by, r2_key, mime
       FROM documents WHERE id = ? AND project_id = ?`,
    )
      .bind(id, projectId)
      .first<DocumentRow & { mime: string | null }>();
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
  if (cached && !shouldRefreshCachedSummary(cached.summary)) {
    return json(parseResponseBody(row, rowToPayload(cached)));
  }

  let sourceText = "";
  let chunkCount = 0;
  let extractWarning: string | undefined;

  const existing = await loadExistingSourceText(env, id);
  if (existing && !looksLikePlaceholderText(existing.text)) {
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
    if (!extracted.ok) {
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

  if (!sourceText.trim() || looksLikePlaceholderText(sourceText)) {
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
    const { answer, llmBackend } = await callLlm(env, [
      { role: "system", content: PARSE_SYSTEM },
      {
        role: "user",
        content: [
          `文件名：${row.filename}`,
          `MIME：${row.mime || "未知"}`,
          "",
          "【文件正文摘录】",
          truncateSource(sourceText),
        ].join("\n"),
      },
    ]);
    const parsed = parseLlmDocumentJson(answer);
    const payload: DocumentParsePayload = {
      summary: parsed.summary,
      documentType: canonicalizeFileTopic(parsed.documentType, row.filename),
      keyPoints: parsed.keyPoints,
      refs: parsed.refs,
      usedFor: parsed.usedFor,
      chunkCount,
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
    if (cached) {
      return json(parseResponseBody(row, rowToPayload(cached)));
    }
    return json({
      documentId: id,
      filename: row.filename,
      mime: row.mime,
      parsed: false,
      summary: `大模型解析失败：${msg}`,
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
