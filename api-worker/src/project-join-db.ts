import type { AppDatabase } from "./app-database";

type Env = { DB: AppDatabase };

export type JoinRequestStatus = "pending" | "approved" | "rejected";

export type JoinRequestRow = {
  id: string;
  project_id: string;
  applicant_user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

export type JoinRequestJson = {
  id: string;
  projectId: string;
  applicantUserId: string;
  status: JoinRequestStatus;
  createdAt: string;
  updatedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

function normalizeStatus(raw: unknown): JoinRequestStatus {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "approved" || v === "rejected") return v;
  return "pending";
}

export function rowToJoinRequestJson(row: JoinRequestRow): JoinRequestJson {
  return {
    id: row.id,
    projectId: row.project_id,
    applicantUserId: row.applicant_user_id,
    status: normalizeStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  };
}

export async function getJoinRequestByProjectAndApplicant(
  env: Env,
  projectId: string,
  applicantUserId: string,
): Promise<JoinRequestJson | null> {
  const row = await env.DB.prepare(
    `SELECT id, project_id, applicant_user_id, status, created_at, updated_at,
            reviewed_by, reviewed_at
     FROM project_join_requests
     WHERE project_id = ? AND applicant_user_id = ?`,
  )
    .bind(projectId, applicantUserId.trim())
    .first<JoinRequestRow>();
  return row ? rowToJoinRequestJson(row) : null;
}

export async function getJoinRequestById(
  env: Env,
  requestId: string,
): Promise<JoinRequestJson | null> {
  const row = await env.DB.prepare(
    `SELECT id, project_id, applicant_user_id, status, created_at, updated_at,
            reviewed_by, reviewed_at
     FROM project_join_requests
     WHERE id = ?`,
  )
    .bind(requestId)
    .first<JoinRequestRow>();
  return row ? rowToJoinRequestJson(row) : null;
}

export async function listPendingJoinRequests(
  env: Env,
): Promise<JoinRequestJson[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, project_id, applicant_user_id, status, created_at, updated_at,
            reviewed_by, reviewed_at
     FROM project_join_requests
     WHERE status = 'pending'
     ORDER BY created_at ASC`,
  ).all<JoinRequestRow>();
  return (results ?? []).map(rowToJoinRequestJson);
}

export async function listReviewedJoinRequests(
  env: Env,
  limit = 80,
): Promise<JoinRequestJson[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, project_id, applicant_user_id, status, created_at, updated_at,
            reviewed_by, reviewed_at
     FROM project_join_requests
     WHERE status IN ('approved', 'rejected')
     ORDER BY COALESCE(reviewed_at, updated_at) DESC
     LIMIT ?`,
  )
    .bind(Math.max(1, Math.min(limit, 200)))
    .all<JoinRequestRow>();
  return (results ?? []).map(rowToJoinRequestJson);
}

export async function listJoinRequestsForApplicant(
  env: Env,
  applicantUserId: string,
): Promise<JoinRequestJson[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, project_id, applicant_user_id, status, created_at, updated_at,
            reviewed_by, reviewed_at
     FROM project_join_requests
     WHERE applicant_user_id = ?
     ORDER BY updated_at DESC`,
  )
    .bind(applicantUserId.trim())
    .all<JoinRequestRow>();
  return (results ?? []).map(rowToJoinRequestJson);
}

export async function listJoinRequestsForProject(
  env: Env,
  projectId: string,
  status?: JoinRequestStatus | null,
): Promise<JoinRequestJson[]> {
  if (status) {
    const { results } = await env.DB.prepare(
      `SELECT id, project_id, applicant_user_id, status, created_at, updated_at,
              reviewed_by, reviewed_at
       FROM project_join_requests
       WHERE project_id = ? AND status = ?
       ORDER BY created_at ASC`,
    )
      .bind(projectId, status)
      .all<JoinRequestRow>();
    return (results ?? []).map(rowToJoinRequestJson);
  }
  const { results } = await env.DB.prepare(
    `SELECT id, project_id, applicant_user_id, status, created_at, updated_at,
            reviewed_by, reviewed_at
     FROM project_join_requests
     WHERE project_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(projectId)
    .all<JoinRequestRow>();
  return (results ?? []).map(rowToJoinRequestJson);
}

/** 新建 pending；若已有 rejected 则重置为 pending；pending/approved 由调用方拦截 */
export async function upsertPendingJoinRequest(
  env: Env,
  projectId: string,
  applicantUserId: string,
): Promise<JoinRequestJson> {
  const now = new Date().toISOString();
  const existing = await getJoinRequestByProjectAndApplicant(
    env,
    projectId,
    applicantUserId,
  );
  if (existing?.status === "pending") {
    return existing;
  }
  if (existing?.status === "rejected") {
    await env.DB.prepare(
      `UPDATE project_join_requests
       SET status = 'pending', updated_at = ?, reviewed_by = NULL, reviewed_at = NULL
       WHERE id = ?`,
    )
      .bind(now, existing.id)
      .run();
    return {
      ...existing,
      status: "pending",
      updatedAt: now,
      reviewedBy: null,
      reviewedAt: null,
    };
  }
  if (existing?.status === "approved") {
    return existing;
  }

  const id = `join-${crypto.randomUUID().replace(/-/gu, "").slice(0, 16)}`;
  await env.DB.prepare(
    `INSERT INTO project_join_requests
       (id, project_id, applicant_user_id, status, created_at, updated_at, reviewed_by, reviewed_at)
     VALUES (?, ?, ?, 'pending', ?, ?, NULL, NULL)`,
  )
    .bind(id, projectId, applicantUserId.trim(), now, now)
    .run();

  return {
    id,
    projectId,
    applicantUserId: applicantUserId.trim(),
    status: "pending",
    createdAt: now,
    updatedAt: now,
    reviewedBy: null,
    reviewedAt: null,
  };
}

export async function reviewJoinRequest(
  env: Env,
  requestId: string,
  status: "approved" | "rejected",
  reviewedBy: string,
): Promise<JoinRequestJson | null> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE project_join_requests
     SET status = ?, updated_at = ?, reviewed_by = ?, reviewed_at = ?
     WHERE id = ? AND status = 'pending'`,
  )
    .bind(status, now, reviewedBy.trim(), now, requestId)
    .run();
  return getJoinRequestById(env, requestId);
}

export async function deletePendingJoinRequestByApplicant(
  env: Env,
  projectId: string,
  applicantUserId: string,
): Promise<boolean> {
  const existing = await getJoinRequestByProjectAndApplicant(
    env,
    projectId,
    applicantUserId,
  );
  if (!existing || existing.status !== "pending") return false;
  await env.DB.prepare(
    `DELETE FROM project_join_requests
     WHERE id = ? AND status = 'pending'`,
  )
    .bind(existing.id)
    .run();
  return true;
}
