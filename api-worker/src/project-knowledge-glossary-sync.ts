import type { AppDatabase } from "./app-database";
import { normalizeStoredChapterVersion } from "./chapter-version";
import { sectionLabel } from "./kn-catalog";
import {
  mergeGlossaryAppend,
  mergeGlossaryFromChapterHtml,
} from "./project-knowledge-citations";
import {
  getDraftItem,
  upsertDraftItem,
} from "./project-knowledge-chapter-revisions-db";
import {
  getProjectKnowledgeChapterHtml,
  listProjectKnowledgeChapterHtml,
  upsertProjectKnowledgeChapterHtml,
} from "./project-knowledge-chapters-db";

const META_SECTIONS = new Set([
  "sources",
  "glossary",
  "versions",
  "project-graph",
]);

/** 当前正式版归档里的空 glossary 一并补上，版本浏览才看得到 */
async function patchCurrentArchivedGlossary(
  db: AppDatabase,
  projectId: string,
  userId: string,
  html: string,
): Promise<void> {
  if (!html.trim()) return;
  const bundle = await db
    .prepare(
      `SELECT version FROM project_knowledge_chapter_bundle WHERE project_id = ?`,
    )
    .bind(projectId)
    .first<{ version: number | string | null }>();
  const version = normalizeStoredChapterVersion(Number(bundle?.version ?? 0));
  if (version < 1) return;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO project_knowledge_chapter_versions
         (project_id, version, section_id, html, source, llm_backend, archived_at, archived_by)
       VALUES (?, ?, 'glossary', ?, 'generate', NULL, ?, ?)
       ON DUPLICATE KEY UPDATE
         html = VALUES(html),
         source = VALUES(source),
         archived_at = VALUES(archived_at),
         archived_by = VALUES(archived_by)`,
    )
    .bind(projectId, version, html, now, userId)
    .run();
}

function hasGlossaryRows(html: string | null | undefined): boolean {
  return /<td\b/iu.test(html ?? "");
}

/** 已发布研究章正文 → 补全名词解释表并落库 */
export async function syncProjectGlossaryFromPublishedChapters(
  db: AppDatabase,
  projectId: string,
  userId: string,
  existingHtml?: string | null,
): Promise<string> {
  const current =
    existingHtml !== undefined
      ? existingHtml
      : ((await getProjectKnowledgeChapterHtml(db, projectId, "glossary"))
          ?.html ?? "");
  const chapters = await listProjectKnowledgeChapterHtml(db, projectId);
  let merged = mergeGlossaryAppend({
    existingHtml: current,
    addHtml: "",
  });
  for (const ch of chapters) {
    if (META_SECTIONS.has(ch.sectionId) || !ch.html?.trim()) continue;
    if (ch.sectionId === "project-overview") continue;
    merged = mergeGlossaryFromChapterHtml({
      existingHtml: merged,
      chapterHtml: ch.html,
      sectionLabel: sectionLabel(ch.sectionId),
    });
  }
  if (merged.trim() === (current ?? "").trim()) return merged;
  if (!hasGlossaryRows(merged) && !hasGlossaryRows(current)) return merged;
  await upsertProjectKnowledgeChapterHtml(db, {
    projectId,
    sectionId: "glossary",
    html: merged,
    source: "generate",
    llmBackend: null,
    updatedBy: userId,
  });
  try {
    await patchCurrentArchivedGlossary(db, projectId, userId, merged);
  } catch {
    /* 正式表已回填；归档失败不阻断 */
  }
  return merged;
}

/** 从文件排版某一章时，把抽到的术语写进同一份草案 */
export async function appendDraftGlossaryFromChapter(
  db: AppDatabase,
  runId: string,
  sectionId: string,
  chapterHtml: string,
): Promise<string | null> {
  const draft = await getDraftItem(db, runId, "glossary");
  const merged = mergeGlossaryFromChapterHtml({
    existingHtml: draft?.html ?? "",
    chapterHtml,
    sectionLabel: sectionLabel(sectionId),
  });
  if (merged.trim() === (draft?.html ?? "").trim()) return merged;
  if (!hasGlossaryRows(merged) && !hasGlossaryRows(draft?.html)) {
    return draft?.html ?? null;
  }
  await upsertDraftItem(db, {
    runId,
    sectionId: "glossary",
    status: "ok",
    html: merged,
    error: null,
    llmBackend: "render",
  });
  return merged;
}
