import type { AppObjectStorage } from "./app-storage";
import type { AppDatabase } from "./app-database";
import { documentAccessError, type DocumentRow } from "./documents-access";
import { getProjectById } from "./projects-db";
import { decodePathProjectId } from "./projects-resolve";
import { canDownloadProjectFile } from "./workspace-roles";

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

/** GET /api/projects/:projectId/files/:docId/download?userId= */
export async function handleDownloadProjectFile(
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

  let row: (DocumentRow & { mime: string | null; deleted_at?: string | null }) | null =
    null;
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

  const accessErr = documentAccessError(row, userId);
  if (accessErr) return json({ error: accessErr }, 403);

  if (row.scope === "package") {
    const allowed = await canDownloadProjectFile(
      env,
      userId,
      projectId,
      project.createdBy,
    );
    if (!allowed) {
      return json({ error: "仅 Admin、Core 或项目创建人可下载资料包文件" }, 403);
    }
  }

  if (!row.r2_key) {
    return json({ error: "文件对象不存在" }, 404);
  }

  const object = await env.FILES.get(row.r2_key);
  if (!object) {
    return json({ error: "对象存储中找不到文件" }, 404);
  }

  const headers = new Headers();
  const mime = row.mime || "application/octet-stream";
  headers.set("Content-Type", mime);
  const name = (row.filename || "download").trim() || "download";
  // ASCII 回退名 + RFC5987，便于跨端解析中文文件名
  const asciiFallback = name.replace(/[^\x20-\x7E]/gu, "_") || "download";
  headers.set(
    "Content-Disposition",
    `attachment; filename="${asciiFallback.replace(/"/gu, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  );

  return new Response(object.body, { status: 200, headers });
}
