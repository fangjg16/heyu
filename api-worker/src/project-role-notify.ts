import type { AppDatabase } from "./app-database";
import { listProjectMemberRoleOverrides } from "./project-member-roles-db";
import {
  insertProjectNotice,
  type ProjectNoticeKind,
} from "./project-notices-db";
import { workspaceUserDisplayName } from "./workspace-display-names";

type Env = { DB: AppDatabase };

async function listProjectAdminAndCoreUserIds(
  env: Env,
  projectId: string,
  createdBy: string | null | undefined,
): Promise<string[]> {
  const ids = new Set<string>();
  const creator = (createdBy ?? "").trim();
  if (creator) ids.add(creator);
  try {
    const overrides = await listProjectMemberRoleOverrides(env, projectId);
    for (const [uid, role] of Object.entries(overrides)) {
      if (role === "admin" || role === "core") ids.add(uid);
    }
  } catch {
    /* 成员表未迁移时至少通知创建人 */
  }
  return [...ids];
}

export async function notifyProjectAdminsAndCores(
  env: Env,
  input: {
    projectId: string;
    projectName: string;
    createdBy?: string | null;
    actorUserId: string;
    kind: ProjectNoticeKind;
    title: string;
    summary: string;
    href?: string | null;
    /** 默认 Admin+Core；知识网络审批只通知 Admin */
    recipients?: "admin_core" | "admin";
  },
): Promise<void> {
  const actor = input.actorUserId.trim();
  const ids = await listProjectAdminAndCoreUserIds(
    env,
    input.projectId,
    input.createdBy,
  );
  let recipients = ids.filter((id) => id !== actor);
  if (input.recipients === "admin") {
    try {
      const overrides = await listProjectMemberRoleOverrides(
        env,
        input.projectId,
      );
      recipients = recipients.filter((id) => {
        if (id === (input.createdBy ?? "").trim()) return true;
        return overrides[id] === "admin";
      });
    } catch {
      recipients = recipients.filter(
        (id) => id === (input.createdBy ?? "").trim(),
      );
    }
  }
  const actorName = workspaceUserDisplayName(actor) || actor;
  try {
    for (const recipientUserId of recipients) {
      await insertProjectNotice(env.DB, {
        projectId: input.projectId,
        recipientUserId,
        actorUserId: actor,
        kind: input.kind,
        title: input.title,
        summary: input.summary.replace("{actor}", actorName),
        href: input.href,
      });
    }
  } catch {
    /* 通知失败不阻断主操作 */
  }
}

export async function notifyProjectUploadOp(
  env: Env,
  input: {
    projectId: string;
    projectName: string;
    createdBy?: string | null;
    actorUserId: string;
    action: "upload" | "move" | "delete";
    filename: string;
  },
): Promise<void> {
  const verb =
    input.action === "upload"
      ? "上传"
      : input.action === "move"
        ? "移动"
        : "删除";
  const kind =
    input.action === "upload"
      ? "file_upload"
      : input.action === "move"
        ? "file_move"
        : "file_delete";
  try {
    await notifyProjectAdminsAndCores(env, {
      projectId: input.projectId,
      projectName: input.projectName,
      createdBy: input.createdBy,
      actorUserId: input.actorUserId,
      kind,
      title: `${verb}了项目资料`,
      summary: `{actor} ${verb}了「${input.projectName}」的项目资料 ${input.filename}`,
      href: `/app/projects/${encodeURIComponent(input.projectId)}/materials`,
    });
  } catch {
    /* 通知失败不阻断主操作 */
  }
}
