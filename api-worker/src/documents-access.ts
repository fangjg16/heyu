/**
 * 资料访问规则：
 * - scope=package：按 projectId 共享（全项目、各账号、各对话共用）
 * - scope=session：按 uploaded_by + conversation_id 隔离
 */

export type DocumentRow = {
  id: string;
  filename: string;
  relative_path?: string | null;
  scope: string;
  conversation_id: string | null;
  mime: string | null;
  r2_key: string;
  uploaded_by: string | null;
  created_at?: string;
};

/** 目录占位（空文件夹），不解析正文、不 embedding */
export const DIRECTORY_MIME = "application/x-directory";

const MAX_RELATIVE_PATH_LEN = 1024;

/**
 * 规范化资料包内父目录路径：统一 /、去首尾斜杠、拒绝 .. 与绝对路径。
 * 返回空串表示根目录。
 */
export function sanitizeRelativePath(raw: string | null | undefined): string {
  let p = String(raw ?? "")
    .replace(/\\/gu, "/")
    .trim();
  if (!p) return "";
  if (p.startsWith("/") || /^[a-zA-Z]:\//u.test(p)) {
    p = p.replace(/^[a-zA-Z]:/u, "").replace(/^\/+/u, "");
  }
  const parts = p
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "." && s !== "..");
  const joined = parts.join("/");
  if (joined.length > MAX_RELATIVE_PATH_LEN) {
    return joined.slice(0, MAX_RELATIVE_PATH_LEN).replace(/\/[^/]*$/u, "");
  }
  return joined;
}

export function isDirectoryMarker(mime: string | null | undefined, filename: string): boolean {
  if ((mime ?? "").trim() === DIRECTORY_MIME) return true;
  return filename === ".keep";
}

export function packageR2Key(projectId: string, docId: string, safeName: string): string {
  return `projects/${projectId}/package/${docId}-${safeName}`;
}

export function sessionR2Key(
  projectId: string,
  userId: string,
  conversationId: string,
  docId: string,
  safeName: string,
): string {
  return `projects/${projectId}/users/${userId}/sessions/${conversationId}/${docId}-${safeName}`;
}

/** 网站列表：项目资料包（共享）+ 该用户的对话临时文件（排除软删） */
const LIST_FILES_SESSION_OWN =
  "(d.scope = 'package' OR (d.scope = 'session' AND d.uploaded_by = ?))";
const LIST_FILES_SESSION_ALL = "(d.scope = 'package' OR d.scope = 'session')";

export function listFilesSqlWithSessionVisibility(
  sql: string,
  viewAllSession: boolean,
): { sql: string; bindUserId: boolean } {
  if (!viewAllSession) return { sql, bindUserId: true };
  return {
    sql: sql.replaceAll(LIST_FILES_SESSION_OWN, LIST_FILES_SESSION_ALL),
    bindUserId: false,
  };
}

/** 源文件树需要完整资料包。200 会按 created_at 丢掉最早上传的文件夹。 */
export const LIST_FILES_LIMIT = 5000;

export const LIST_FILES_SQL = `
  SELECT d.id, d.filename, d.relative_path, d.scope, d.conversation_id, d.mime, d.byte_size, d.created_at, d.uploaded_by,
         d.source_kind, d.shared_with_issuer, d.file_category, d.version_group, d.replaces_document_id,
         (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count,
         (SELECT COUNT(*) FROM document_parse_results p WHERE p.document_id COLLATE utf8mb4_unicode_ci = d.id) AS parse_count
  FROM documents d
  WHERE d.project_id = ?
    AND (d.deleted_at IS NULL OR d.deleted_at = '')
    AND (d.scope = 'package' OR (d.scope = 'session' AND d.uploaded_by = ?))
  ORDER BY d.created_at DESC
  LIMIT ${LIST_FILES_LIMIT}
`;

/** 无 source_kind / shared_with_issuer / file_category（migration 0026 前） */
export const LIST_FILES_SQL_NO_COLLAB = `
  SELECT d.id, d.filename, d.relative_path, d.scope, d.conversation_id, d.mime, d.byte_size, d.created_at, d.uploaded_by,
         (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count,
         (SELECT COUNT(*) FROM document_parse_results p WHERE p.document_id COLLATE utf8mb4_unicode_ci = d.id) AS parse_count
  FROM documents d
  WHERE d.project_id = ?
    AND (d.deleted_at IS NULL OR d.deleted_at = '')
    AND (d.scope = 'package' OR (d.scope = 'session' AND d.uploaded_by = ?))
  ORDER BY d.created_at DESC
  LIMIT ${LIST_FILES_LIMIT}
`;

/** 迁移前兼容：无 relative_path 列时的列表 SQL */
export const LIST_FILES_SQL_LEGACY = `
  SELECT d.id, d.filename, d.scope, d.conversation_id, d.mime, d.created_at, d.uploaded_by,
         0 AS byte_size,
         (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count,
         0 AS parse_count
  FROM documents d
  WHERE d.project_id = ?
    AND (d.deleted_at IS NULL OR d.deleted_at = '')
    AND (d.scope = 'package' OR (d.scope = 'session' AND d.uploaded_by = ?))
  ORDER BY d.created_at DESC
  LIMIT ${LIST_FILES_LIMIT}
`;

/** 无 deleted_at 列时的列表 SQL（migration 0013 前） */
export const LIST_FILES_SQL_NO_SOFT_DELETE = `
  SELECT d.id, d.filename, d.relative_path, d.scope, d.conversation_id, d.mime, d.created_at, d.uploaded_by,
         0 AS byte_size,
         (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count,
         (SELECT COUNT(*) FROM document_parse_results p WHERE p.document_id COLLATE utf8mb4_unicode_ci = d.id) AS parse_count
  FROM documents d
  WHERE d.project_id = ?
    AND (d.scope = 'package' OR (d.scope = 'session' AND d.uploaded_by = ?))
  ORDER BY d.created_at DESC
  LIMIT ${LIST_FILES_LIMIT}
`;

/** 无 document_parse_results 表时的列表 SQL */
export const LIST_FILES_SQL_NO_PARSE = `
  SELECT d.id, d.filename, d.relative_path, d.scope, d.conversation_id, d.mime, d.created_at, d.uploaded_by,
         0 AS byte_size,
         (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count,
         0 AS parse_count
  FROM documents d
  WHERE d.project_id = ?
    AND (d.deleted_at IS NULL OR d.deleted_at = '')
    AND (d.scope = 'package' OR (d.scope = 'session' AND d.uploaded_by = ?))
  ORDER BY d.created_at DESC
  LIMIT ${LIST_FILES_LIMIT}
`;

/** 无 byte_size 列时的列表 SQL（migration 0015 前） */
export const LIST_FILES_SQL_NO_BYTE_SIZE = `
  SELECT d.id, d.filename, d.relative_path, d.scope, d.conversation_id, d.mime, d.created_at, d.uploaded_by,
         0 AS byte_size,
         (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count,
         (SELECT COUNT(*) FROM document_parse_results p WHERE p.document_id COLLATE utf8mb4_unicode_ci = d.id) AS parse_count
  FROM documents d
  WHERE d.project_id = ?
    AND (d.deleted_at IS NULL OR d.deleted_at = '')
    AND (d.scope = 'package' OR (d.scope = 'session' AND d.uploaded_by = ?))
  ORDER BY d.created_at DESC
  LIMIT ${LIST_FILES_LIMIT}
`;

/** 对话 RAG：项目资料包（共享）+ 当前用户当前对话的 session（排除软删） */
export const LOAD_CHUNKS_SQL = `
  SELECT c.id, c.document_id, c.chunk_index, c.text, c.embedding_json, d.filename, d.scope
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE d.project_id = ?
    AND (d.deleted_at IS NULL OR d.deleted_at = '')
    AND (
      d.scope = 'package'
      OR (d.scope = 'session' AND d.uploaded_by = ? AND d.conversation_id = ?)
    )
  ORDER BY c.document_id, c.chunk_index
  LIMIT 500
`;

export const LOAD_CHUNKS_SQL_NO_SOFT_DELETE = `
  SELECT c.id, c.document_id, c.chunk_index, c.text, c.embedding_json, d.filename, d.scope
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE d.project_id = ?
    AND (
      d.scope = 'package'
      OR (d.scope = 'session' AND d.uploaded_by = ? AND d.conversation_id = ?)
    )
  ORDER BY c.document_id, c.chunk_index
  LIMIT 500
`;

export function isPackageScope(scope: string): boolean {
  return scope !== "session";
}

/** 校验读取权限；通过返回 null，否则返回错误文案 */
export function documentAccessError(
  row: Pick<DocumentRow, "scope" | "uploaded_by">,
  userId: string | null,
  opts?: { viewAllSession?: boolean },
): string | null {
  if (isPackageScope(row.scope)) return null;
  if (opts?.viewAllSession) return null;
  if (!userId) return "缺少 userId（对话临时文件须指定上传者）";
  if (row.uploaded_by !== userId) return "文档不存在或无权访问";
  return null;
}

const MAX_FILENAME_LEN = 240;

/** 文件/文件夹名：去掉路径分隔符，拒绝空名与 .keep */
export function sanitizeDocumentFilename(raw: string | null | undefined): string | null {
  const original = String(raw ?? "").trim();
  if (/[/\\]/u.test(original)) return null;
  const name = original.trim();
  if (!name || name === "." || name === ".." || name === ".keep") return null;
  if (name.length > MAX_FILENAME_LEN) return name.slice(0, MAX_FILENAME_LEN);
  return name;
}

export function isUnderFolderPath(
  relativePath: string | null | undefined,
  folderPath: string,
): boolean {
  const current = sanitizeRelativePath(relativePath);
  const folder = sanitizeRelativePath(folderPath);
  if (!folder) return false;
  return current === folder || current.startsWith(`${folder}/`);
}

/** 文件夹改名后，把子文件的 relative_path 从 fromPath 前缀换成 toPath */
export function remapRelativePathAfterFolderRename(
  relativePath: string | null | undefined,
  fromPath: string,
  toPath: string,
): string {
  const current = sanitizeRelativePath(relativePath);
  const from = sanitizeRelativePath(fromPath);
  const to = sanitizeRelativePath(toPath);
  if (!from || from === to) return current;
  if (current === from) return to;
  if (current.startsWith(`${from}/`)) {
    return `${to}${current.slice(from.length)}`;
  }
  return current;
}
