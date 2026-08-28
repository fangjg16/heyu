import type { AppDatabase } from "./app-database";
import { getProjectKnowledgeChapterHtml } from "./project-knowledge-chapters-db";
import { stripHtmlToPlainTextForSummary } from "./knowledge-network-intent";

export const KN_CHAPTER_CITE_MARKER = "【指定知识网络章节】";

export function formatKnowledgeChapterCiteTag(
  sectionId: string,
  label: string,
): string {
  const id = sectionId.trim();
  const name = label.trim() || id;
  return `${KN_CHAPTER_CITE_MARKER}${id}:${name}`;
}

export function parseCitedKnowledgeChapter(
  message: string,
): { sectionId: string; label: string } | null {
  const m = message.match(/【指定知识网络章节】([a-z0-9-]+)(?::([^\n]+))?/u);
  if (!m?.[1]) return null;
  const sectionId = m[1];
  const label = (m[2] ?? "").trim() || sectionId;
  return { sectionId, label };
}

export async function buildCitedChapterExcerpt(
  db: AppDatabase,
  projectId: string,
  message: string,
): Promise<string | null> {
  const cited = parseCitedKnowledgeChapter(message);
  if (!cited) return null;
  const row = await getProjectKnowledgeChapterHtml(
    db,
    projectId,
    cited.sectionId,
  );
  const title = cited.label;
  if (!row?.html?.trim()) {
    return `【知识网络章节：${title}】本章尚无已发布正文。`;
  }
  const plain = stripHtmlToPlainTextForSummary(row.html, 20_000);
  return `【知识网络章节：${title}】\n${plain}`;
}
