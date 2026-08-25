import type { AppDatabase } from "./app-database";
import { normalizeStoredChapterVersion } from "./chapter-version";
import { isDirectoryMarker } from "./documents-access";
import {
  extractCiteIdsFromHtml,
  mergeCitedSourcesIntoTable,
  type SourceFileHint,
} from "./project-knowledge-citations";
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

const SECTION_SOURCE_LABELS: Record<string, string> = {
  snapshot: "项目快照",
  objectives: "标的概况",
  industry: "行业分析",
  legal: "合规分析",
  benchmarks: "对标分析",
  business: "业务模式",
  returns: "财务与回报",
  capabilities: "资源网络",
  ownership: "背景调查",
  diligence: "尽职调查",
  risks: "风险矩阵",
  questions: "待确认问题",
  framework: "决策路径与法律结构",
  "project-overview": "项目概览",
};

type PackageSourceRow = {
  filename: string;
  mime?: string | null;
  summary?: string | null;
  document_type?: string | null;
};

function mapPackageSourceRows(rows: PackageSourceRow[]): SourceFileHint[] {
  const files: SourceFileHint[] = [];
  let n = 0;
  for (const d of rows) {
    if (isDirectoryMarker(d.mime ?? null, d.filename)) continue;
    n += 1;
    files.push({
      id: `A-${n}`,
      title: d.filename,
      type: "项目文件",
      excerpt: (d.summary ?? "").trim().slice(0, 180),
    });
  }
  return files;
}

async function listPackageSourceFiles(
  db: AppDatabase,
  projectId: string,
): Promise<SourceFileHint[]> {
  const queries = [
    `SELECT d.filename, d.mime, p.summary, p.document_type
     FROM documents d
     LEFT JOIN document_parse_results p ON p.document_id = d.id
     WHERE d.project_id = ?
       AND d.scope = 'package'
       AND (d.deleted_at IS NULL OR d.deleted_at = '')
     ORDER BY d.created_at ASC
     LIMIT 200`,
    `SELECT d.filename, d.mime, p.summary, p.document_type
     FROM documents d
     LEFT JOIN document_parse_results p ON p.document_id = d.id
     WHERE d.project_id = ? AND d.scope = 'package'
     ORDER BY d.created_at ASC
     LIMIT 200`,
    `SELECT filename, mime
     FROM documents
     WHERE project_id = ?
       AND scope = 'package'
       AND (deleted_at IS NULL OR deleted_at = '')
     ORDER BY created_at ASC
     LIMIT 200`,
    `SELECT filename, mime
     FROM documents
     WHERE project_id = ? AND scope = 'package'
     ORDER BY created_at ASC
     LIMIT 200`,
  ];
  for (const sql of queries) {
    try {
      const q = await db.prepare(sql).bind(projectId).all<PackageSourceRow>();
      return mapPackageSourceRows(q.results ?? []);
    } catch {
      /* 缺列或缺表时换下一条 */
    }
  }
  return [];
}

/** 当前正式版归档里的空 sources 一并补上，版本浏览才看得到 */
async function patchCurrentArchivedSources(
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
       VALUES (?, ?, 'sources', ?, 'generate', NULL, ?, ?)
       ON DUPLICATE KEY UPDATE
         html = VALUES(html),
         source = VALUES(source),
         archived_at = VALUES(archived_at),
         archived_by = VALUES(archived_by)`,
    )
    .bind(projectId, version, html, now, userId)
    .run();
}

/** 已发布章节里的引用 + 资料包文件 → 补全 sources 表并落库 */
export async function syncProjectSourcesFromPublishedChapters(
  db: AppDatabase,
  projectId: string,
  userId: string,
  existingHtml?: string | null,
): Promise<string> {
  const current =
    existingHtml !== undefined
      ? existingHtml
      : ((await getProjectKnowledgeChapterHtml(db, projectId, "sources"))
          ?.html ?? "");
  const chapters = await listProjectKnowledgeChapterHtml(db, projectId);
  const citations: { id: string; usedIn: string }[] = [];
  for (const ch of chapters) {
    if (META_SECTIONS.has(ch.sectionId) || !ch.html?.trim()) continue;
    const label = SECTION_SOURCE_LABELS[ch.sectionId] ?? ch.sectionId;
    for (const id of extractCiteIdsFromHtml(ch.html)) {
      citations.push({ id, usedIn: label });
    }
  }
  const files = await listPackageSourceFiles(db, projectId);
  const merged = mergeCitedSourcesIntoTable({
    existingHtml: current,
    citations,
    files,
  });
  if (!merged.changed) return merged.html;
  await upsertProjectKnowledgeChapterHtml(db, {
    projectId,
    sectionId: "sources",
    html: merged.html,
    source: "generate",
    llmBackend: null,
    updatedBy: userId,
  });
  try {
    await patchCurrentArchivedSources(db, projectId, userId, merged.html);
  } catch {
    /* 正式表已回填；归档失败不阻断 */
  }
  return merged.html;
}
