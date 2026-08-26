import type { AppObjectStorage } from "./app-storage";
import type { AppDatabase } from "./app-database";
import { invalidateChunkCache } from "./chunk-cache";
import {
  documentAccessError,
  isUnderFolderPath,
  remapRelativePathAfterFolderRename,
  sanitizeDocumentFilename,
  sanitizeRelativePath,
  type DocumentRow,
} from "./documents-access";
import { canManageProjectRecord } from "./projects-auth";
import { getProjectById } from "./projects-db";
import { decodePathProjectId } from "./projects-resolve";
import { recordOperationLog } from "./operation-logs-db";
import { notifyProjectUploadOp } from "./project-role-notify";
import {
  canManageProjectUploads,
  resolveProjectRole,
  roleCanViewAllSessionUploads,
} from "./workspace-roles";

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
  if (doc.scope !== "session") {
    if (await canManageProjectUploads(env, userId, project.id, project.createdBy)) {
      return true;
    }
  }
  if (doc.uploaded_by && doc.uploaded_by === userId) return true;
  return false;
}

async function viewAllSessionFor(
  env: Env,
  userId: string,
  project: { id: string; createdBy: string | null },
): Promise<boolean> {
  const role = await resolveProjectRole(
    env,
    userId,
    project.id,
    project.createdBy,
  );
  return roleCanViewAllSessionUploads(role);
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

  const accessErr = documentAccessError(row, userId, {
    viewAllSession: await viewAllSessionFor(env, userId, project),
  });
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
    return json({ error: "仅项目管理员、Core 或该文件上传者可删除" }, 403);
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

    await recordOperationLog(env.DB, {
      actorUserId: userId,
      category: "file",
      action: "delete",
      targetKind: "document",
      targetId: id,
      targetLabel: row.filename,
      summary: `删除「${project.name}」中的文件 ${row.filename}`,
    });

    if (row.scope !== "session") {
      await notifyProjectUploadOp(env, {
        projectId,
        projectName: project.name,
        createdBy: project.createdBy,
        actorUserId: userId,
        action: "delete",
        filename: row.filename,
      });
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
 * body: { relativePath?: string, filename?: string }
 * — relativePath：资料包内移动到目标父目录（空串=根）
 * — filename：重命名（不含路径）
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

  let body: { relativePath?: unknown; filename?: unknown } = {};
  try {
    body = (await request.json()) as { relativePath?: unknown; filename?: unknown };
  } catch {
    return json({ error: "请求体须为 JSON" }, 400);
  }
  const hasMove = "relativePath" in body;
  const hasRename = "filename" in body;
  if (!hasMove && !hasRename) {
    return json({ error: "请提供 filename 或 relativePath" }, 400);
  }

  let nextFilename: string | null = null;
  if (hasRename) {
    nextFilename = sanitizeDocumentFilename(
      typeof body.filename === "string" ? body.filename : "",
    );
    if (!nextFilename) return json({ error: "文件名无效" }, 400);
  }
  const relativePath = hasMove
    ? sanitizeRelativePath(
        typeof body.relativePath === "string" ? body.relativePath : "",
      )
    : null;

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

  if (hasMove && row.scope !== "package") {
    return json({ error: "仅项目资料包文件可移动目录" }, 400);
  }

  const accessErr = documentAccessError(row, userId, {
    viewAllSession: await viewAllSessionFor(env, userId, project),
  });
  if (accessErr) return json({ error: accessErr }, 403);

  if (!(await canDeleteDocument(env, row, userId, project))) {
    return json({ error: "仅项目管理员、Core 或该文件上传者可修改" }, 403);
  }

  const currentPath = sanitizeRelativePath(row.relative_path ?? "");
  const destPath = relativePath ?? currentPath;
  const destName = nextFilename ?? row.filename;
  const unchanged =
    destPath === currentPath && destName === row.filename;
  if (unchanged) {
    return json({
      ok: true,
      documentId: id,
      relativePath: destPath,
      filename: destName,
      unchanged: true,
    });
  }

  if (destName !== row.filename || destPath !== currentPath) {
    const clash = await findSameNameDocument(
      env,
      projectId,
      destName,
      destPath,
      id,
    );
    if (clash) return json({ error: "同目录下已有同名文件" }, 409);
  }

  try {
    await env.DB.prepare(
      `UPDATE documents SET relative_path = ?, filename = ? WHERE id = ? AND project_id = ?
       AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(destPath, destName, id, projectId)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown column ['`]?deleted_at['`]?/i.test(msg) || /no such column:\s*deleted_at/i.test(msg)) {
      await env.DB.prepare(
        `UPDATE documents SET relative_path = ?, filename = ? WHERE id = ? AND project_id = ?`,
      )
        .bind(destPath, destName, id, projectId)
        .run();
    } else if (/Unknown column ['`]?relative_path['`]?/i.test(msg) || /no such column:\s*relative_path/i.test(msg)) {
      if (hasMove) {
        return json(
          { error: "relative_path 列未迁移，请先执行 migration 0011" },
          503,
        );
      }
      await env.DB.prepare(
        `UPDATE documents SET filename = ? WHERE id = ? AND project_id = ?`,
      )
        .bind(destName, id, projectId)
        .run();
    } else {
      return json({ error: `更新失败：${msg}` }, 500);
    }
  }

  await invalidateChunkCache(projectId, userId, undefined);
  if (row.uploaded_by && row.uploaded_by !== userId) {
    await invalidateChunkCache(projectId, row.uploaded_by, undefined);
  }

  if (row.scope !== "session") {
    await notifyProjectUploadOp(env, {
      projectId,
      projectName: project.name,
      createdBy: project.createdBy,
      actorUserId: userId,
      action: destName !== row.filename ? "rename" : "move",
      filename: destName,
    });
  }

  return json({
    ok: true,
    documentId: id,
    relativePath: destPath,
    filename: destName,
  });
}

type FolderDocRow = {
  id: string;
  filename: string;
  relative_path?: string | null;
  mime: string | null;
  scope: string;
  uploaded_by: string | null;
};

async function findSameNameDocument(
  env: Env,
  projectId: string,
  filename: string,
  relativePath: string,
  exceptId?: string,
): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      `SELECT id FROM documents
       WHERE project_id = ?
         AND filename = ?
         AND COALESCE(relative_path, '') = ?
         AND (deleted_at IS NULL OR deleted_at = '')
         ${exceptId ? "AND id <> ?" : ""}
       LIMIT 1`,
    )
      .bind(
        ...(exceptId
          ? [projectId, filename, relativePath, exceptId]
          : [projectId, filename, relativePath]),
      )
      .first<{ id: string }>();
    return Boolean(row?.id);
  } catch {
    const row = await env.DB.prepare(
      `SELECT id FROM documents
       WHERE project_id = ?
         AND filename = ?
         AND COALESCE(relative_path, '') = ?
         ${exceptId ? "AND id <> ?" : ""}
       LIMIT 1`,
    )
      .bind(
        ...(exceptId
          ? [projectId, filename, relativePath, exceptId]
          : [projectId, filename, relativePath]),
      )
      .first<{ id: string }>();
    return Boolean(row?.id);
  }
}

/**
 * POST /api/projects/:projectId/folders/rename
 * body: { fromPath: string, newName: string }
 */
export async function handleRenameProjectFolder(
  request: Request,
  env: Env,
  pathProjectId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = normalizeUserId(url.searchParams.get("userId"));
  if (!userId) return json({ error: "缺少 userId 查询参数" }, 400);

  const projectId = decodePathProjectId(pathProjectId);
  let body: { fromPath?: unknown; newName?: unknown } = {};
  try {
    body = (await request.json()) as { fromPath?: unknown; newName?: unknown };
  } catch {
    return json({ error: "请求体须为 JSON" }, 400);
  }

  const fromPath = sanitizeRelativePath(
    typeof body.fromPath === "string" ? body.fromPath : "",
  );
  const newName = sanitizeDocumentFilename(
    typeof body.newName === "string" ? body.newName : "",
  );
  if (!fromPath) return json({ error: "缺少文件夹路径" }, 400);
  if (!newName) return json({ error: "文件夹名称无效" }, 400);
  if (!fromPath.includes("/")) {
    return json({ error: "不能重命名资料根目录" }, 400);
  }

  const parts = fromPath.split("/").filter(Boolean);
  const oldName = parts[parts.length - 1] ?? "";
  const parent = parts.slice(0, -1).join("/");
  const toPath = parent ? `${parent}/${newName}` : newName;
  if (fromPath === toPath) {
    return json({ ok: true, fromPath, toPath, unchanged: true, updated: 0 });
  }

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  if (!(await canManageProjectUploads(env, userId, project.id, project.createdBy))) {
    const can = await canManageProjectRecord(
      env,
      project as import("./projects-db").ProjectJson,
      userId,
    );
    if (!can) return json({ error: "仅项目管理员或 Core 可重命名文件夹" }, 403);
  }

  let rows: FolderDocRow[] = [];
  try {
    const listed = await env.DB.prepare(
      `SELECT id, filename, relative_path, mime, scope, uploaded_by
       FROM documents
       WHERE project_id = ?
         AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(projectId)
      .all<FolderDocRow>();
    rows = listed.results ?? [];
  } catch {
    const listed = await env.DB.prepare(
      `SELECT id, filename, relative_path, mime, scope, uploaded_by
       FROM documents WHERE project_id = ?`,
    )
      .bind(projectId)
      .all<FolderDocRow>();
    rows = listed.results ?? [];
  }

  const under = rows.filter(
    (r) => r.scope === "package" && isUnderFolderPath(r.relative_path, fromPath),
  );
  if (under.length === 0) {
    return json({ error: "文件夹不存在或为空" }, 404);
  }

  const destClash = rows.some((r) => {
    if (r.scope !== "package") return false;
    if (under.some((u) => u.id === r.id)) return false;
    const path = sanitizeRelativePath(r.relative_path);
    return path === toPath || path.startsWith(`${toPath}/`);
  });
  if (destClash) {
    return json({ error: `已存在文件夹「${newName}」` }, 409);
  }

  let updated = 0;
  try {
    for (const row of under) {
      const nextPath = remapRelativePathAfterFolderRename(
        row.relative_path,
        fromPath,
        toPath,
      );
      if (nextPath === sanitizeRelativePath(row.relative_path)) continue;
      try {
        await env.DB.prepare(
          `UPDATE documents SET relative_path = ? WHERE id = ? AND project_id = ?
           AND (deleted_at IS NULL OR deleted_at = '')`,
        )
          .bind(nextPath, row.id, projectId)
          .run();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/Unknown column ['`]?deleted_at['`]?/i.test(msg) || /no such column:\s*deleted_at/i.test(msg)) {
          await env.DB.prepare(
            `UPDATE documents SET relative_path = ? WHERE id = ? AND project_id = ?`,
          )
            .bind(nextPath, row.id, projectId)
            .run();
        } else {
          throw e;
        }
      }
      updated += 1;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `重命名失败：${msg}` }, 500);
  }

  await invalidateChunkCache(projectId, userId, undefined);

  await recordOperationLog(env.DB, {
    actorUserId: userId,
    category: "file",
    action: "rename-folder",
    targetKind: "folder",
    targetId: fromPath,
    targetLabel: toPath,
    summary: `将「${project.name}」中的文件夹 ${oldName} 重命名为 ${newName}`,
  });

  await notifyProjectUploadOp(env, {
    projectId,
    projectName: project.name,
    createdBy: project.createdBy,
    actorUserId: userId,
    action: "rename",
    filename: newName,
  });

  return json({
    ok: true,
    fromPath,
    toPath,
    updated,
  });
}
