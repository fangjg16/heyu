import type { AppDatabase } from "./app-database";

export type ProjectNoticeKind =
  | "file_upload"
  | "file_move"
  | "file_delete"
  | "kn_draft";

export type ProjectNotice = {
  id: string;
  projectId: string;
  recipientUserId: string;
  actorUserId: string;
  kind: ProjectNoticeKind;
  title: string;
  summary: string;
  href: string | null;
  createdAt: string;
};

type NoticeRow = {
  id: string;
  project_id: string;
  recipient_user_id: string;
  actor_user_id: string;
  kind: string;
  title: string;
  summary: string;
  href: string | null;
  created_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function newNoticeId(): string {
  return `ntc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isMissingTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /project_notices/i.test(msg) && /doesn't exist|no such table|Unknown table/i.test(msg);
}

export async function insertProjectNotice(
  db: AppDatabase,
  input: {
    projectId: string;
    recipientUserId: string;
    actorUserId: string;
    kind: ProjectNoticeKind;
    title: string;
    summary: string;
    href?: string | null;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO project_notices
           (id, project_id, recipient_user_id, actor_user_id, kind, title, summary, href, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newNoticeId(),
        input.projectId,
        input.recipientUserId,
        input.actorUserId,
        input.kind,
        input.title.slice(0, 512),
        input.summary.slice(0, 1024),
        input.href ?? null,
        nowIso(),
      )
      .run();
  } catch (e) {
    if (isMissingTable(e)) return;
    throw e;
  }
}

export async function listProjectNoticesForUser(
  db: AppDatabase,
  userId: string,
  limit = 50,
): Promise<ProjectNotice[]> {
  try {
    const q = await db
      .prepare(
        `SELECT id, project_id, recipient_user_id, actor_user_id, kind, title, summary, href, created_at
         FROM project_notices
         WHERE recipient_user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(userId, limit)
      .all<NoticeRow>();
    return (q.results ?? []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      recipientUserId: r.recipient_user_id,
      actorUserId: r.actor_user_id,
      kind: r.kind as ProjectNoticeKind,
      title: r.title,
      summary: r.summary,
      href: r.href,
      createdAt: r.created_at,
    }));
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}
