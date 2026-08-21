import { apiFetch } from "@/lib/api-auth";
import { isUserAccountDisabled } from "@/lib/account-status";
import { stripOrgRoleLabel } from "@/lib/org-title";
import type { WorkspaceRole } from "@/workspace/types";

export type AdminWorkspaceUser = {
  id: string;
  username: string;
  displayName: string;
  orgTitle: string;
  avatarChar: string;
  avatarClass: string;
  avatarUrl?: string;
  isPlatformAdmin: boolean;
  status: string;
  isDisabled?: boolean;
};

async function readError(res: Response): Promise<string> {
  if (res.status === 404) {
    return "用户管理暂不可用，请稍后重试。";
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error || `请求失败（${res.status}）`;
}

function normalizeAdminUser(user: AdminWorkspaceUser): AdminWorkspaceUser {
  const disabled = isUserAccountDisabled(user);
  return {
    ...user,
    orgTitle: stripOrgRoleLabel(user.orgTitle),
    status: disabled ? "disabled" : "active",
    isDisabled: disabled,
  };
}

export async function fetchAdminWorkspaceUsers(): Promise<AdminWorkspaceUser[]> {
  const res = await apiFetch("/api/admin/workspace-users");
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { users?: AdminWorkspaceUser[] };
  return (data.users ?? []).map(normalizeAdminUser);
}

export async function createAdminWorkspaceUser(input: {
  username: string;
  password: string;
  displayName: string;
  orgTitle?: string;
  avatarChar?: string;
  avatarUrl?: string;
  isPlatformAdmin?: boolean;
}): Promise<AdminWorkspaceUser> {
  const res = await apiFetch("/api/admin/workspace-users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { user?: AdminWorkspaceUser };
  if (!data.user) throw new Error("创建失败：无返回用户");
  return normalizeAdminUser(data.user);
}

export async function patchAdminWorkspaceUser(
  userId: string,
  input: {
    username?: string;
    displayName?: string;
    orgTitle?: string;
    avatarChar?: string;
    avatarUrl?: string;
    isPlatformAdmin?: boolean;
    status?: "active" | "disabled";
  },
): Promise<AdminWorkspaceUser> {
  const res = await apiFetch(
    `/api/admin/workspace-users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { user?: AdminWorkspaceUser };
  if (!data.user) throw new Error("更新失败：无返回用户");
  return normalizeAdminUser(data.user);
}

export async function setAdminWorkspaceUserPassword(
  userId: string,
  password: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/admin/workspace-users/${encodeURIComponent(userId)}/password`,
    {
      method: "PUT",
      body: JSON.stringify({ password }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
}

export async function deleteAdminWorkspaceUser(userId: string): Promise<void> {
  const res = await apiFetch(
    `/api/admin/workspace-users/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(await readError(res));
}

export type AdminUserProjectMembership = {
  projectId: string;
  projectName: string;
  openness: string;
  role: WorkspaceRole;
  isCreator: boolean;
};

export async function fetchAdminUserProjectMemberships(
  userId: string,
): Promise<AdminUserProjectMembership[]> {
  const res = await apiFetch(
    `/api/admin/workspace-users/${encodeURIComponent(userId)}/project-memberships`,
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    memberships?: AdminUserProjectMembership[];
  };
  return data.memberships ?? [];
}

/** 管理中枢：取消用户在某项目的成员权限 */
export async function deleteAdminUserProjectMembership(
  userId: string,
  projectId: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/admin/workspace-users/${encodeURIComponent(userId)}/project-memberships/${encodeURIComponent(projectId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(await readError(res));
}
