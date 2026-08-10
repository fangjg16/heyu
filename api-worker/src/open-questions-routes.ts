import type { AppDatabase } from "./app-database";
import {
  parseOpenQuestionsFromHtml,
  priorityLabel,
  priorityRank,
  type OpenQuestionPriority,
} from "./open-questions-parse";
import { filterProjectsForDirectory } from "./projects-auth";
import { listProjects } from "./projects-db";
import {
  listQuestionsChapterHtmlForProjects,
} from "./project-knowledge-chapters-db";

type Env = { DB: AppDatabase };

const MAX_ITEMS = 20;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeUserId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 128) return null;
  return id;
}

export type OpenQuestionItemJson = {
  id: string;
  projectId: string;
  projectName: string;
  text: string;
  priority: OpenQuestionPriority;
  priorityLabel: string;
  updatedAt: string;
};

/** GET /api/me/open-questions */
export async function handleListMyOpenQuestions(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const userId = normalizeUserId(authUserId);
  if (!userId) return json({ error: "未登录" }, 401);

  const projects = await listProjects(env);
  const visible = await filterProjectsForDirectory(env, userId, projects);
  if (visible.length === 0) {
    return json({ items: [] as OpenQuestionItemJson[], total: 0 });
  }

  const nameById = new Map(visible.map((p) => [p.id, p.name] as const));
  const rows = await listQuestionsChapterHtmlForProjects(
    env.DB,
    visible.map((p) => p.id),
  );

  const collected: OpenQuestionItemJson[] = [];
  for (const row of rows) {
    const projectName = nameById.get(row.projectId) ?? row.projectId;
    const parsed = parseOpenQuestionsFromHtml(row.html);
    parsed.forEach((q, i) => {
      collected.push({
        id: `${row.projectId}:${i}:${q.priority}`,
        projectId: row.projectId,
        projectName,
        text: q.text,
        priority: q.priority,
        priorityLabel: priorityLabel(q.priority),
        updatedAt: row.updatedAt,
      });
    });
  }

  collected.sort((a, b) => {
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const items = collected.slice(0, MAX_ITEMS);
  return json({ items, total: collected.length });
}
