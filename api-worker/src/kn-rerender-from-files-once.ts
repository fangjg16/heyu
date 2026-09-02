/**
 * 临时候：合域项目用资料包里已有分析重新渲知识网络章节，不重写文件、不跑概览。
 * 用过后在 README 的 upload_note 记下 used，避免误当成常驻能力。
 */
import type { AppDatabase } from "./app-database";
import type { AnalysisKind } from "./analysis-kind";
import { knSectionRendersFromFiles } from "./chapter-from-deliverables";
import { fullDraftSectionIds } from "./kn-catalog";

export const HEYU_RERENDER_ONCE_PROJECT_ID = "proj-b4e11bf7d24a";
export const HEYU_RERENDER_ONCE_NAME = "合域 AI 家族办公室投研平台";
export const HEYU_RERENDER_ONCE_USED_NOTE = "rerender-kn-from-files:heyu-v1:used";

export function isHeyuRerenderOnceProject(
  projectId: string,
  name?: string | null,
): boolean {
  if (projectId.trim() === HEYU_RERENDER_ONCE_PROJECT_ID) return true;
  return (name ?? "").trim() === HEYU_RERENDER_ONCE_NAME;
}

export function knSectionsToRerenderFromFiles(kind: AnalysisKind): string[] {
  return fullDraftSectionIds(kind).filter(
    (id) => id !== "project-overview" && knSectionRendersFromFiles(kind, id),
  );
}

export async function markHeyuRerenderOnceUsed(
  db: AppDatabase,
  projectId: string,
): Promise<void> {
  try {
    const existed = await db
      .prepare(
        `SELECT id FROM documents
         WHERE project_id = ?
           AND (deleted_at IS NULL OR deleted_at = '')
           AND upload_note LIKE ?
         LIMIT 1`,
      )
      .bind(projectId, `%${HEYU_RERENDER_ONCE_USED_NOTE}%`)
      .first<{ id: string }>();
    if (existed?.id) return;
    const row = await db
      .prepare(
        `SELECT id, upload_note FROM documents
         WHERE project_id = ? AND (deleted_at IS NULL OR deleted_at = '')
           AND filename = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(projectId, "README.md")
      .first<{ id: string; upload_note: string | null }>();
    if (!row?.id) return;
    const next = `${(row.upload_note ?? "").trim()}\n${HEYU_RERENDER_ONCE_USED_NOTE}`.trim();
    await db
      .prepare(`UPDATE documents SET upload_note = ? WHERE id = ? AND project_id = ?`)
      .bind(next, row.id, projectId)
      .run();
  } catch {
    /* 记不了也不挡这次渲章 */
  }
}
