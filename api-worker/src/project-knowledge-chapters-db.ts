import type { AppDatabase } from "./app-database";

export type ChapterHtmlSource = "generate" | "revise";

export type ProjectKnowledgeChapterHtmlRow = {
  project_id: string;
  section_id: string;
  html: string;
  source: string;
  llm_backend: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type ProjectKnowledgeChapterHtmlPublic = {
  projectId: string;
  sectionId: string;
  html: string;
  source: ChapterHtmlSource | string;
  llmBackend: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

export function rowToChapterHtml(
  r: ProjectKnowledgeChapterHtmlRow,
): ProjectKnowledgeChapterHtmlPublic {
  return {
    projectId: r.project_id,
    sectionId: r.section_id,
    html: r.html,
    source: r.source,
    llmBackend: r.llm_backend,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

export async function getProjectKnowledgeChapterHtml(
  db: AppDatabase,
  projectId: string,
  sectionId: string,
): Promise<ProjectKnowledgeChapterHtmlPublic | null> {
  const row = await db
    .prepare(
      `SELECT project_id, section_id, html, source, llm_backend, updated_at, updated_by
       FROM project_knowledge_chapter_html
       WHERE project_id = ? AND section_id = ?`,
    )
    .bind(projectId, sectionId)
    .first<ProjectKnowledgeChapterHtmlRow>();
  return row ? rowToChapterHtml(row) : null;
}

export async function listProjectKnowledgeChapterHtml(
  db: AppDatabase,
  projectId: string,
): Promise<ProjectKnowledgeChapterHtmlPublic[]> {
  const q = await db
    .prepare(
      `SELECT project_id, section_id, html, source, llm_backend, updated_at, updated_by
       FROM project_knowledge_chapter_html
       WHERE project_id = ?
       ORDER BY section_id ASC`,
    )
    .bind(projectId)
    .all<ProjectKnowledgeChapterHtmlRow>();
  return (q.results ?? []).map(rowToChapterHtml);
}

/** 批量读取多项目的「待确认问题」章节（section_id=questions） */
export async function listQuestionsChapterHtmlForProjects(
  db: AppDatabase,
  projectIds: string[],
): Promise<ProjectKnowledgeChapterHtmlPublic[]> {
  const ids = [...new Set(projectIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const out: ProjectKnowledgeChapterHtmlPublic[] = [];
  const batchSize = 40;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const placeholders = batch.map(() => "?").join(",");
    const q = await db
      .prepare(
        `SELECT project_id, section_id, html, source, llm_backend, updated_at, updated_by
         FROM project_knowledge_chapter_html
         WHERE section_id = 'questions'
           AND project_id IN (${placeholders})
           AND html IS NOT NULL
           AND TRIM(html) <> ''`,
      )
      .bind(...batch)
      .all<ProjectKnowledgeChapterHtmlRow>();
    for (const row of q.results ?? []) {
      out.push(rowToChapterHtml(row));
    }
  }
  return out;
}

/** 批量读取多项目的研究章节 HTML（排除 sources/glossary 等元页面） */
export async function listResearchChapterHtmlForProjects(
  db: AppDatabase,
  projectIds: string[],
): Promise<ProjectKnowledgeChapterHtmlPublic[]> {
  const ids = [...new Set(projectIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const out: ProjectKnowledgeChapterHtmlPublic[] = [];
  const batchSize = 40;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const placeholders = batch.map(() => "?").join(",");
    const q = await db
      .prepare(
        `SELECT project_id, section_id, html, source, llm_backend, updated_at, updated_by
         FROM project_knowledge_chapter_html
         WHERE project_id IN (${placeholders})
           AND html IS NOT NULL
           AND TRIM(html) <> ''
           AND section_id NOT IN ('sources', 'glossary', 'versions', 'project-overview', 'project-graph')`,
      )
      .bind(...batch)
      .all<ProjectKnowledgeChapterHtmlRow>();
    for (const row of q.results ?? []) {
      out.push(rowToChapterHtml(row));
    }
  }
  return out;
}

export async function upsertProjectKnowledgeChapterHtml(
  db: AppDatabase,
  input: {
    projectId: string;
    sectionId: string;
    html: string;
    source: ChapterHtmlSource;
    llmBackend: string | null;
    updatedBy: string;
  },
): Promise<ProjectKnowledgeChapterHtmlPublic> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO project_knowledge_chapter_html
         (project_id, section_id, html, source, llm_backend, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         html = VALUES(html),
         source = VALUES(source),
         llm_backend = VALUES(llm_backend),
         updated_at = VALUES(updated_at),
         updated_by = VALUES(updated_by)`,
    )
    .bind(
      input.projectId,
      input.sectionId,
      input.html,
      input.source,
      input.llmBackend,
      now,
      input.updatedBy,
    )
    .run();
  const row = await getProjectKnowledgeChapterHtml(
    db,
    input.projectId,
    input.sectionId,
  );
  if (!row) {
    throw new Error("章节 HTML 落库后读取失败");
  }
  return row;
}

/** 非空 HTML 的章节数（用于「已有内容 / 13」；排除 sources 等元页面） */
export async function countPopulatedProjectKnowledgeChapters(
  db: AppDatabase,
  projectId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM project_knowledge_chapter_html
       WHERE project_id = ?
         AND TRIM(html) <> ''
         AND section_id NOT IN ('sources', 'glossary', 'versions', 'project-overview', 'project-graph')`,
    )
    .bind(projectId)
    .first<{ cnt: number | string }>();
  return Number(row?.cnt ?? 0) || 0;
}
