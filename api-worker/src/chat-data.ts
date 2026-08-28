import type { AppDatabase } from "./app-database";
import { getCachedChunks, putCachedChunks } from "./chunk-cache";
import { parseEmbeddingJson } from "./embeddings";
import {
  LOAD_CHUNKS_SQL,
  LOAD_CHUNKS_SQL_NO_SOFT_DELETE,
} from "./documents-access";
import {
  filenameMatchesPriority,
  type ChunkRow,
} from "./search";

export type ChatDataEnv = { DB: AppDatabase };

export async function loadChunks(
  env: ChatDataEnv,
  projectId: string,
  userId: string,
  conversationId?: string,
): Promise<ChunkRow[]> {
  const convKey = conversationId ?? "";
  const cached = await getCachedChunks(projectId, userId, convKey);
  if (cached) return cached;

  let results: (ChunkRow & { embedding_json?: string | null })[] | null = null;
  try {
    const q = await env.DB.prepare(LOAD_CHUNKS_SQL)
      .bind(projectId, userId, convKey)
      .all<ChunkRow & { embedding_json?: string | null }>();
    results = q.results ?? [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown column ['`]?deleted_at['`]?/i.test(msg) || /no such column:\s*deleted_at/i.test(msg)) {
      const q = await env.DB.prepare(LOAD_CHUNKS_SQL_NO_SOFT_DELETE)
        .bind(projectId, userId, convKey)
        .all<ChunkRow & { embedding_json?: string | null }>();
      results = q.results ?? [];
    } else {
      throw e;
    }
  }

  const rows: ChunkRow[] = (results ?? []).map((r) => ({
    id: r.id,
    document_id: r.document_id,
    chunk_index: r.chunk_index,
    text: r.text,
    filename: r.filename,
    scope: r.scope,
    embedding: parseEmbeddingJson(r.embedding_json),
  }));

  await putCachedChunks(projectId, userId, convKey, rows);
  return rows;
}

function mapChunkRows(
  results: (ChunkRow & { embedding_json?: string | null })[],
): ChunkRow[] {
  return results.map((r) => ({
    id: r.id,
    document_id: r.document_id,
    chunk_index: r.chunk_index,
    text: r.text,
    filename: r.filename,
    scope: r.scope,
    embedding: parseEmbeddingJson(r.embedding_json),
  }));
}

const NAMED_CHUNKS_SQL = `
  SELECT c.id, c.document_id, c.chunk_index, c.text, c.embedding_json, d.filename, d.scope
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE d.project_id = ?
    AND (d.deleted_at IS NULL OR d.deleted_at = '')
    AND (
      d.scope = 'package'
      OR (d.scope = 'session' AND d.uploaded_by = ? AND d.conversation_id = ?)
    )
    AND d.id IN (__IDS__)
  ORDER BY c.document_id, c.chunk_index
  LIMIT 200
`;

const NAMED_CHUNKS_SQL_NO_SOFT_DELETE = `
  SELECT c.id, c.document_id, c.chunk_index, c.text, c.embedding_json, d.filename, d.scope
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE d.project_id = ?
    AND (
      d.scope = 'package'
      OR (d.scope = 'session' AND d.uploaded_by = ? AND d.conversation_id = ?)
    )
    AND d.id IN (__IDS__)
  ORDER BY c.document_id, c.chunk_index
  LIMIT 200
`;

async function resolveNamedDocumentIds(
  env: ChatDataEnv,
  projectId: string,
  userId: string,
  conversationId: string,
  fileIds: string[],
  filenames: string[],
): Promise<string[]> {
  const ids = [...new Set(fileIds.map((s) => s.trim()).filter(Boolean))];
  const names = [...new Set(filenames.map((s) => s.trim()).filter(Boolean))];
  if (ids.length === 0 && names.length === 0) return [];

  const found = new Set(ids);
  if (names.length === 0) return [...found];

  try {
    const q = await env.DB.prepare(
      `SELECT id, filename FROM documents
       WHERE project_id = ?
         AND (deleted_at IS NULL OR deleted_at = '')
         AND (
           scope = 'package'
           OR (scope = 'session' AND uploaded_by = ? AND conversation_id = ?)
         )
       ORDER BY created_at DESC
       LIMIT 2000`,
    )
      .bind(projectId, userId, conversationId)
      .all<{ id: string; filename: string }>();
    for (const row of q.results ?? []) {
      if (filenameMatchesPriority(row.filename, names)) found.add(row.id);
    }
  } catch {
    try {
      const q = await env.DB.prepare(
        `SELECT id, filename FROM documents
         WHERE project_id = ?
           AND (
             scope = 'package'
             OR (scope = 'session' AND uploaded_by = ? AND conversation_id = ?)
           )
         ORDER BY created_at DESC
         LIMIT 2000`,
      )
        .bind(projectId, userId, conversationId)
        .all<{ id: string; filename: string }>();
      for (const row of q.results ?? []) {
        if (filenameMatchesPriority(row.filename, names)) found.add(row.id);
      }
    } catch {
      /* 列表失败时仍用调用方传入的 id */
    }
  }
  return [...found];
}

async function loadChunksByDocumentIds(
  env: ChatDataEnv,
  projectId: string,
  userId: string,
  conversationId: string,
  documentIds: string[],
): Promise<ChunkRow[]> {
  if (documentIds.length === 0) return [];
  const placeholders = documentIds.map(() => "?").join(", ");
  const binds = [projectId, userId, conversationId, ...documentIds];
  const trySql = async (sql: string) => {
    const q = await env.DB.prepare(sql.replace("__IDS__", placeholders))
      .bind(...binds)
      .all<ChunkRow & { embedding_json?: string | null }>();
    return mapChunkRows(q.results ?? []);
  };
  try {
    return await trySql(NAMED_CHUNKS_SQL);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown column ['`]?deleted_at['`]?/i.test(msg) || /no such column:\s*deleted_at/i.test(msg)) {
      return trySql(NAMED_CHUNKS_SQL_NO_SOFT_DELETE);
    }
    throw e;
  }
}

/** 用户点名/附上的源文件：不受资料包 500 chunk 上限影响，按 id 或文件名单独拉取 */
export async function loadNamedDocumentChunks(
  env: ChatDataEnv,
  projectId: string,
  userId: string,
  conversationId: string | undefined,
  fileIds?: string[] | null,
  filenames?: string[] | null,
): Promise<ChunkRow[]> {
  const convKey = conversationId ?? "";
  const ids = await resolveNamedDocumentIds(
    env,
    projectId,
    userId,
    convKey,
    fileIds ?? [],
    filenames ?? [],
  );
  if (ids.length === 0) return [];
  return loadChunksByDocumentIds(env, projectId, userId, convKey, ids);
}

export type NamedParseSummary = {
  documentId: string;
  filename: string;
  summary: string;
  keyPoints: string[];
};

function parseKeyPointsJson(raw: string | null | undefined): string[] {
  const t = (raw ?? "").trim();
  if (!t) return [];
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 8);
  } catch {
    return [];
  }
}

/** 点名文件没有可用 chunk 时，用已解析摘要兜底（源文件详情里那份） */
export async function loadNamedParseSummaries(
  env: ChatDataEnv,
  projectId: string,
  userId: string,
  conversationId: string | undefined,
  fileIds?: string[] | null,
  filenames?: string[] | null,
): Promise<NamedParseSummary[]> {
  const convKey = conversationId ?? "";
  const ids = await resolveNamedDocumentIds(
    env,
    projectId,
    userId,
    convKey,
    fileIds ?? [],
    filenames ?? [],
  );
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  try {
    const q = await env.DB.prepare(
      `SELECT d.id, d.filename, p.summary, p.key_points_json
       FROM documents d
       JOIN document_parse_results p ON p.document_id = d.id
       WHERE d.project_id = ?
         AND d.id IN (${placeholders})`,
    )
      .bind(projectId, ...ids)
      .all<{
        id: string;
        filename: string;
        summary: string | null;
        key_points_json: string | null;
      }>();
    return (q.results ?? [])
      .map((r) => ({
        documentId: r.id,
        filename: r.filename,
        summary: (r.summary ?? "").trim(),
        keyPoints: parseKeyPointsJson(r.key_points_json),
      }))
      .filter((r) => r.summary.length > 0);
  } catch {
    return [];
  }
}

export function mergeChunkRows(base: ChunkRow[], extra: ChunkRow[]): ChunkRow[] {
  if (extra.length === 0) return base;
  const seen = new Set(base.map((c) => c.id));
  const out = [...extra.filter((c) => !seen.has(c.id)), ...base];
  return out;
}
