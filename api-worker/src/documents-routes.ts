import type { AppObjectStorage } from "./app-storage";
import type { AppDatabase } from "./app-database";
import { invalidateChunkCache } from "./chunk-cache";
import {
  documentAccessError,
  sanitizeRelativePath,
  type DocumentRow,
} from "./documents-access";
import { canManageProjectRecord } from "./projects-auth";
import { getProjectById } from "./projects-db";
import { decodePathProjectId } from "./projects-resolve";

type Env = { DB: AppDatabase; FILES: AppObjectStorage };

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

async function canDeleteDocument(
  env: Env,
  doc: Pick<DocumentRow, "scope" | "uploaded_by">,
  userId: string,
  project: { id: string; createdBy: string | null },
): Promise<boolean> {
  if (
    await canManageProjectRecord(
      env,
      project as import("./projects-db").ProjectJson,
      userId,
    )
  ) {
    return true;
  }
  if (doc.uploaded_by && doc.uploaded_by === userId) return true;
  return false;
}

export async function handleDeleteProjectFile(
  request: Request,
  env: Env,
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

  let row: (DocumentRow & { deleted_at?: string | null }) | null = null;
  try {
    row = await env.DB.prepare(
      `SELECT id, project_id, filename, scope, conversation_id, uploaded_by, r2_key, deleted_at
       FROM documents WHERE id = ? AND project_id = ?`,
    )
      .bind(id, projectId)
      .first<DocumentRow & { deleted_at?: string | null }>();
  } catch {
    row = await env.DB.prepare(
      `SELECT id, project_id, filename, scope, conversation_id, uploaded_by, r2_key
       FROM documents WHERE id = ? AND project_id = ?`,
    )
      .bind(id, projectId)
      .first<DocumentRow>();
  }

  if (!row || (row.deleted_at != null && String(row.deleted_at).trim() !== "")) {
    return json({ error: "文件不存在或已删除" }, 404);
  }

  const accessErr = documentAccessError(row, userId);
  if (accessErr) return json({ error: accessErr }, 403);

  const conversationId = (url.searchParams.get("conversationId") ?? "").trim();
  if (
    row.scope === "session" &&
    conversationId &&
    row.conversation_id &&
    row.conversation_id !== conversationId
  ) {
    return json({ error: "该文件不属于当前对话" }, 403);
  }

  if (!(await canDeleteDocument(env, row, userId, project))) {
    return json({ error: "仅项目创建人、平台管理员或该文件上传者可删除" }, 403);
  }

  try {
    const t = new Date().toISOString();
    try {
      await env.DB.prepare(
        `UPDATE documents SET deleted_at = ? WHERE id = ? AND project_id = ?
         AND (deleted_at IS NULL OR deleted_at = '')`,
      )
        .bind(t, id, projectId)
        .run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/Unknown column ['`]?deleted_at['`]?|no such column:\s*deleted_at/i.test(msg)) {
        return json(
          { error: "软删除列未迁移（缺少 documents.deleted_at），请先执行 migration 0013" },
          503,
        );
      }
      throw e;
    }

    // 仅失效检索缓存；保留 chunks 与 MinIO 对象
    await invalidateChunkCache(
      projectId,
      userId,
      row.scope === "session" ? row.conversation_id ?? undefined : undefined,
    );
    if (row.uploaded_by && row.uploaded_by !== userId) {
      await invalidateChunkCache(
        projectId,
        row.uploaded_by,
        row.scope === "session" ? row.conversation_id ?? undefined : undefined,
      );
    }

    return json({
      ok: true,
      documentId: id,
      projectId,
      filename: row.filename,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `删除失败：${msg}` }, 500);
  }
}

/**
 * PATCH /api/projects/:projectId/files/:docId
 * body: { relativePath?: string } — 资料包内移动到目标父目录（空串=根）
 */
export async function handlePatchProjectFile(
  request: Request,
  env: Env,
  pathProjectId: string,
  docId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = normalizeUserId(url.searchParams.get("userId"));
  if (!userId) return json({ error: "缺少 userId 查询参数" }, 400);

  const projectId = decodePathProjectId(pathProjectId);
  const id = docId.trim();
  if (!id) return json({ error: "缺少 documentId" }, 400);

  let body: { relativePath?: unknown } = {};
  try {
    body = (await request.json()) as { relativePath?: unknown };
  } catch {
    return json({ error: "请求体须为 JSON" }, 400);
  }
  if (!("relativePath" in body)) {
    return json({ error: "缺少 relativePath" }, 400);
  }
  const relativePath = sanitizeRelativePath(
    typeof body.relativePath === "string" ? body.relativePath : "",
  );

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  let row: (DocumentRow & { deleted_at?: string | null }) | null = null;
  try {
    row = await env.DB.prepare(
      `SELECT id, project_id, filename, scope, conversation_id, uploaded_by, r2_key, relative_path, deleted_at
       FROM documents WHERE id = ? AND project_id = ?`,
    )
      .bind(id, projectId)
      .first<DocumentRow & { deleted_at?: string | null }>();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown column ['`]?relative_path['`]?/i.test(msg) || /no such column:\s*relative_path/i.test(msg)) {
      return json(
        { error: "relative_path 列未迁移，请先执行 migration 0011" },
        503,
      );
    }
    row = await env.DB.prepare(
      `SELECT id, project_id, filename, scope, conversation_id, uploaded_by, r2_key, deleted_at
       FROM documents WHERE id = ? AND project_id = ?`,
    )
      .bind(id, projectId)
      .first<DocumentRow & { deleted_at?: string | null }>();
  }

  if (!row || (row.deleted_at != null && String(row.deleted_at).trim() !== "")) {
    return json({ error: "文件不存在或已删除" }, 404);
  }

  if (row.scope !== "package") {
    return json({ error: "仅项目资料包文件可移动目录" }, 400);
  }

  const accessErr = documentAccessError(row, userId);
  if (accessErr) return json({ error: accessErr }, 403);

  if (!(await canDeleteDocument(env, row, userId, project))) {
    return json({ error: "仅项目创建人、平台管理员或该文件上传者可移动" }, 403);
  }

  const current = sanitizeRelativePath(row.relative_path ?? "");
  if (current === relativePath) {
    return json({
      ok: true,
      documentId: id,
      relativePath,
      unchanged: true,
    });
  }

  try {
    await env.DB.prepare(
      `UPDATE documents SET relative_path = ? WHERE id = ? AND project_id = ?
       AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(relativePath, id, projectId)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown column ['`]?deleted_at['`]?/i.test(msg) || /no such column:\s*deleted_at/i.test(msg)) {
      await env.DB.prepare(
        `UPDATE documents SET relative_path = ? WHERE id = ? AND project_id = ?`,
      )
        .bind(relativePath, id, projectId)
        .run();
    } else if (/Unknown column ['`]?relative_path['`]?/i.test(msg) || /no such column:\s*relative_path/i.test(msg)) {
      return json(
        { error: "relative_path 列未迁移，请先执行 migration 0011" },
        503,
      );
    } else {
      return json({ error: `移动失败：${msg}` }, 500);
    }
  }

  await invalidateChunkCache(projectId, userId, undefined);
  if (row.uploaded_by && row.uploaded_by !== userId) {
    await invalidateChunkCache(projectId, row.uploaded_by, undefined);
  }

  return json({
    ok: true,
    documentId: id,
    relativePath,
    filename: row.filename,
  });
}
