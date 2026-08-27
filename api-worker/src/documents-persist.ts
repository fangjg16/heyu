import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
import {
  packageR2Key,
  sanitizeRelativePath,
  sessionR2Key,
} from "./documents-access";

export type PersistEnv = {
  DB: AppDatabase;
  FILES: AppObjectStorage;
};

export type NewDocumentRow = {
  id: string;
  projectId: string;
  conversationId: string | null;
  filename: string;
  relativePath: string;
  r2Key: string;
  mime: string;
  byteSize: number;
  scope: string;
  uploadedBy: string;
  createdAt: string;
};

export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/u).pop() || name;
  return base.replace(/[^\w.\-一-龥]/gu, "_") || "file";
}

export function r2KeyForUpload(opts: {
  projectId: string;
  docId: string;
  fileName: string;
  scope: string;
  uploadedBy: string;
  conversationId: string | null;
}): string {
  const safe = safeFileName(opts.fileName);
  if (opts.scope === "session" && opts.conversationId) {
    return sessionR2Key(opts.projectId, opts.uploadedBy, opts.conversationId, opts.docId, safe);
  }
  return packageR2Key(opts.projectId, opts.docId, safe);
}

export async function insertDocumentRow(env: PersistEnv, row: NewDocumentRow): Promise<void> {
  const insertWithPathAndSize = async () => {
    await env.DB.prepare(
      `INSERT INTO documents (id, project_id, conversation_id, filename, relative_path, r2_key, mime, byte_size, scope, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        row.id,
        row.projectId,
        row.conversationId,
        row.filename,
        row.relativePath,
        row.r2Key,
        row.mime,
        row.byteSize,
        row.scope,
        row.uploadedBy,
        row.createdAt,
      )
      .run();
  };
  const insertWithPath = async () => {
    await env.DB.prepare(
      `INSERT INTO documents (id, project_id, conversation_id, filename, relative_path, r2_key, mime, scope, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        row.id,
        row.projectId,
        row.conversationId,
        row.filename,
        row.relativePath,
        row.r2Key,
        row.mime,
        row.scope,
        row.uploadedBy,
        row.createdAt,
      )
      .run();
  };
  const insertLegacy = async () => {
    await env.DB.prepare(
      `INSERT INTO documents (id, project_id, conversation_id, filename, r2_key, mime, scope, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        row.id,
        row.projectId,
        row.conversationId,
        row.filename,
        row.r2Key,
        row.mime,
        row.scope,
        row.uploadedBy,
        row.createdAt,
      )
      .run();
  };

  try {
    await insertWithPathAndSize();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown column ['`]?byte_size['`]?/i.test(msg) || /no such column:\s*byte_size/i.test(msg)) {
      try {
        await insertWithPath();
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        if (
          /Unknown column ['`]?relative_path['`]?/i.test(msg2) ||
          /no such column:\s*relative_path/i.test(msg2)
        ) {
          await insertLegacy();
        } else {
          throw e2;
        }
      }
    } else if (
      /Unknown column ['`]?relative_path['`]?/i.test(msg) ||
      /no such column:\s*relative_path/i.test(msg)
    ) {
      await insertLegacy();
    } else {
      throw e;
    }
  }
}

export async function findDocumentIdByPath(
  env: PersistEnv,
  projectId: string,
  relativePath: string,
  filename: string,
): Promise<string | null> {
  const path = sanitizeRelativePath(relativePath);
  const tries = [
    `SELECT id FROM documents WHERE project_id = ? AND filename = ? AND relative_path = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`,
    `SELECT id FROM documents WHERE project_id = ? AND filename = ? AND relative_path = ? LIMIT 1`,
  ];
  for (const sql of tries) {
    try {
      const row = await env.DB.prepare(sql)
        .bind(projectId, filename, path)
        .first<{ id: string }>();
      if (row?.id) return row.id;
    } catch {
      /* 列不存在则试下一条 */
    }
  }
  return null;
}

export function joinRelative(parent: string, child: string): string {
  const a = sanitizeRelativePath(parent);
  const b = sanitizeRelativePath(child);
  if (!a) return b;
  if (!b) return a;
  return `${a}/${b}`;
}

export function fileStem(fileName: string): string {
  const base = fileName.split(/[/\\]/u).pop() || fileName;
  return base.replace(/\.[^.]+$/u, "").trim() || "file";
}
