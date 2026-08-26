import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Loader2, Pencil, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import {
  createAdminWorkspaceUser,
  deleteAdminUserProjectMembership,
  deleteAdminWorkspaceUser,
  fetchAdminUserProjectMemberships,
  fetchAdminWorkspaceUsers,
  patchAdminWorkspaceUser,
  setAdminWorkspaceUserPassword,
  type AdminUserProjectMembership,
  type AdminWorkspaceUser,
} from "@/lib/admin-users-api";
import { fetchWorkspaceUsersDirectory, fetchAuthMe } from "@/lib/api-auth";
import { isUserAccountDisabled } from "@/lib/account-status";
import {
  fetchProjectsFromApi,
  updateProjectPermissions,
} from "@/lib/project-api";
import type { WorkspaceProject } from "@/workspace/projects";
import type { WorkspaceRole } from "@/workspace/types";
import { PROJECT_ASSIGNABLE_ROLES } from "@/workspace/types";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { ProjectRoleSelects } from "@/components/workspace/MemberRoleFields";
import { UserAvatar } from "@/components/workspace/UserAvatar";
import { stripOrgRoleLabel } from "@/lib/org-title";
import {
  dismissIfBackdropClick,
  markBackdropPointerDown,
} from "@/lib/backdrop-dismiss";

const ASSIGNABLE: WorkspaceRole[] = [...PROJECT_ASSIGNABLE_ROLES];

const inputClass =
  "mt-1 w-full rounded-lg border border-[hsl(var(--sand))] bg-white px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--wine-deep)/0.35)]";

function portalModal(node: ReactNode) {
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

type FormState = {
  username: string;
  displayName: string;
  orgTitle: string;
  isPlatformAdmin: boolean;
  status: "active" | "disabled";
  password: string;
};

/** 编辑态：项目勾选 + 角色 */
type ProjectDraft = {
  projectId: string;
  name: string;
  selected: boolean;
  role: WorkspaceRole;
  isCreator: boolean;
};

const PRESET_ORGS = ["合域"];

const emptyForm = (): FormState => ({
  username: "",
  displayName: "",
  orgTitle: "",
  isPlatformAdmin: false,
  status: "active",
  password: "",
});

type AdminUsersSectionProps = {
  selfUserId: string;
};

export function AdminUsersSection({ selfUserId }: AdminUsersSectionProps) {
  const [users, setUsers] = useState<AdminWorkspaceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminWorkspaceUser | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [pwdUser, setPwdUser] = useState<AdminWorkspaceUser | null>(null);
  const [pwdValue, setPwdValue] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [projectDrafts, setProjectDrafts] = useState<ProjectDraft[]>([]);
  const [initialMemberships, setInitialMemberships] = useState<
    AdminUserProjectMembership[]
  >([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const orgSuggestions = useMemo(() => {
    const fromUsers = users
      .map((u) => stripOrgRoleLabel(u.orgTitle))
      .filter(Boolean);
    return Array.from(new Set([...PRESET_ORGS, ...fromUsers])).sort((a, b) =>
      a.localeCompare(b, "zh"),
    );
  }, [users]);

  useBodyScrollLock(editorOpen || Boolean(pwdUser));

  const refreshDirectory = useCallback(async () => {
    try {
      await fetchWorkspaceUsersDirectory();
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchAdminWorkspaceUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const buildProjectDrafts = (
    projects: WorkspaceProject[],
    memberships: AdminUserProjectMembership[],
  ): ProjectDraft[] => {
    const byId = new Map(memberships.map((m) => [m.projectId, m]));
    return [...projects]
      .sort((a, b) => a.name.localeCompare(b.name, "zh"))
      .map((p) => {
        const m = byId.get(p.id);
        const isCreator = Boolean(m?.isCreator);
        const role =
          m?.role && ASSIGNABLE.includes(m.role as WorkspaceRole)
            ? (m.role as WorkspaceRole)
            : m?.role === "mid"
              ? ("low" as const)
              : m?.role === "admin"
                ? ("admin" as const)
                : ("core" as const);
        return {
          projectId: p.id,
          name: p.name,
          selected: Boolean(m) || isCreator,
          role: isCreator ? "admin" : role,
          isCreator,
        };
      });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setProjectDrafts([]);
    setInitialMemberships([]);
    setHint(null);
    setError(null);
    setEditorOpen(true);
  };

  const openEdit = (u: AdminWorkspaceUser) => {
    setEditing(u);
    setForm({
      username: u.username,
      displayName: u.displayName,
      orgTitle: stripOrgRoleLabel(u.orgTitle),
      isPlatformAdmin: u.isPlatformAdmin,
      status: isUserAccountDisabled(u) ? "disabled" : "active",
      password: "",
    });
    setProjectDrafts([]);
    setInitialMemberships([]);
    setHint(null);
    setError(null);
    setEditorOpen(true);
    setProjectsLoading(true);
    void Promise.all([
      fetchAdminUserProjectMemberships(u.id),
      fetchProjectsFromApi(undefined, { userId: selfUserId }).catch(
        () => [] as WorkspaceProject[],
      ),
    ])
      .then(([memberships, projects]) => {
        setInitialMemberships(memberships);
        setProjectDrafts(buildProjectDrafts(projects, memberships));
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setProjectsLoading(false));
  };

  const syncProjectMemberships = async (targetUserId: string) => {
    const initialIds = new Set(initialMemberships.map((m) => m.projectId));
    const initialRole = new Map(
      initialMemberships.map((m) => [m.projectId, m.role as string]),
    );

    const errors: string[] = [];
    for (const draft of projectDrafts) {
      if (draft.isCreator) continue;
      try {
        if (draft.selected) {
          const role = ASSIGNABLE.includes(draft.role) ? draft.role : "core";
          const prev = initialRole.get(draft.projectId);
          if (!initialIds.has(draft.projectId) || prev !== role) {
            await updateProjectPermissions(draft.projectId, selfUserId, [
              { userId: targetUserId, role },
            ]);
          }
        } else if (initialIds.has(draft.projectId)) {
          // 走管理端 DELETE，避免旧 permissions PUT 把空 role 当成「无效角色」
          await deleteAdminUserProjectMembership(
            targetUserId,
            draft.projectId,
          );
        }
      } catch (e) {
        errors.push(
          `${draft.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    if (errors.length > 0) {
      throw new Error(`项目权限未完全保存：${errors.join("；")}`);
    }
  };

  const onSaveUser = async () => {
    if (editing && !editing.isPlatformAdmin && !form.isPlatformAdmin && projectsLoading) {
      setError("项目权限仍在加载，请稍候再保存");
      return;
    }
    setSaving(true);
    setError(null);
    setHint(null);
    try {
      if (editing) {
        await patchAdminWorkspaceUser(editing.id, {
          username: form.username,
          displayName: form.displayName,
          orgTitle: stripOrgRoleLabel(form.orgTitle),
          isPlatformAdmin: form.isPlatformAdmin,
          status: form.status,
        });
        if (!form.isPlatformAdmin) {
          await syncProjectMemberships(editing.id);
        }
        setHint(
          "用户已更新。对方需刷新或重新打开项目总览后，角色才会更新。",
        );
      } else {
        await createAdminWorkspaceUser({
          username: form.username,
          password: form.password,
          displayName: form.displayName,
          orgTitle: stripOrgRoleLabel(form.orgTitle),
          isPlatformAdmin: form.isPlatformAdmin,
        });
        setHint("用户已创建");
      }
      setEditorOpen(false);
      await load();
      await refreshDirectory();
      if (editing && editing.id === selfUserId) {
        await fetchAuthMe().catch(() => null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onDeleteUser = async (u: AdminWorkspaceUser) => {
    if (u.id === selfUserId || deletingId) return;
    if (
      !window.confirm(
        `确定停用用户「${u.displayName}」(@${u.username})？账号将无法登录，成员关系会移除；用户与项目资料数据保留。`,
      )
    ) {
      return;
    }
    setDeletingId(u.id);
    setError(null);
    setHint(null);
    try {
      await deleteAdminWorkspaceUser(u.id);
      setHint(`已停用 ${u.displayName}`);
      setUsers((prev) =>
        prev.map((row) =>
          row.id === u.id ? { ...row, status: "disabled", isDisabled: true } : row,
        ),
      );
      await load();
      await refreshDirectory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const onEnableUser = async (u: AdminWorkspaceUser) => {
    if (u.id === selfUserId || deletingId) return;
    setDeletingId(u.id);
    setError(null);
    setHint(null);
    try {
      await patchAdminWorkspaceUser(u.id, { status: "active" });
      setHint(`已启用 ${u.displayName}`);
      setUsers((prev) =>
        prev.map((row) =>
          row.id === u.id ? { ...row, status: "active", isDisabled: false } : row,
        ),
      );
      await load();
      await refreshDirectory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const onSavePassword = async () => {
    if (!pwdUser) return;
    setPwdSaving(true);
    setError(null);
    try {
      await setAdminWorkspaceUserPassword(pwdUser.id, pwdValue);
      setPwdUser(null);
      setPwdValue("");
      setHint(`已重置 ${pwdUser.displayName} 的密码`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPwdSaving(false);
    }
  };

  const toggleProject = (projectId: string) => {
    setProjectDrafts((prev) =>
      prev.map((p) => {
        if (p.projectId !== projectId || p.isCreator) return p;
        return { ...p, selected: !p.selected };
      }),
    );
  };

  const setProjectRole = (projectId: string, role: WorkspaceRole) => {
    setProjectDrafts((prev) =>
      prev.map((p) =>
        p.projectId === projectId && !p.isCreator ? { ...p, role } : p,
      ),
    );
  };

  return (
    <section
      className="mt-6 rounded-2xl border border-[hsl(var(--wine-deep)/0.18)] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] md:p-5"
      aria-labelledby="admin-users-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--wine-deep)/0.08)] text-[hsl(var(--wine-deep))]">
            <Users className="h-4 w-4" strokeWidth={2} aria-hidden />
          </div>
          <h2
            id="admin-users-heading"
            className="text-xs font-bold uppercase tracking-wide text-foreground"
          >
            用户管理
          </h2>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[hsl(var(--wine-deep)/0.32)] bg-[hsl(var(--wine-deep)/0.06)] px-3 py-1.5 text-[11px] font-semibold text-[hsl(var(--wine-deep))] transition-colors hover:bg-[hsl(var(--wine-deep)/0.1)]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          新建用户
        </button>
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          加载用户列表…
        </p>
      ) : null}

      {error && !editorOpen && !pwdUser ? (
        <p className="mt-3 rounded-lg border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-700">
          {error}
        </p>
      ) : null}

      {hint ? (
        <p className="mt-3 text-[11px] font-medium text-emerald-700">{hint}</p>
      ) : null}

      {!loading && users.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {users.map((u) => {
            const disabled = isUserAccountDisabled(u);
            return (
              <li
                key={u.id}
                className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  <UserAvatar
                    user={u}
                    className="h-8 w-8 shrink-0 text-[11px]"
                    fallbackClassName={
                      u.avatarClass || "bg-slate-300 text-slate-800"
                    }
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {u.displayName}
                      {u.id === selfUserId ? (
                        <span className="ml-1.5 text-[10px] font-semibold text-[hsl(var(--wine-deep))]">
                          当前
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                  {u.isPlatformAdmin ? (
                    <span className="rounded-full border border-[hsl(var(--wine)/0.35)] bg-[hsl(var(--wine-muted)/0.4)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--wine))]">
                      Admin
                    </span>
                  ) : null}
                  {disabled ? (
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                      已停用
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openEdit(u)}
                    className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/40"
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPwdUser(u);
                      setPwdValue("");
                      setError(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/40"
                  >
                    <KeyRound className="h-3 w-3" aria-hidden />
                    重置密码
                  </button>
                  {u.id !== selfUserId ? (
                    disabled ? (
                      <button
                        type="button"
                        disabled={Boolean(deletingId)}
                        onClick={() => void onEnableUser(u)}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200/90 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                        title="启用用户"
                      >
                        {deletingId === u.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        ) : (
                          <RotateCcw className="h-3 w-3" aria-hidden />
                        )}
                        启用
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(deletingId)}
                        onClick={() => void onDeleteUser(u)}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-200/90 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        title="停用用户"
                      >
                        {deletingId === u.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-3 w-3" aria-hidden />
                        )}
                        停用
                      </button>
                    )
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!loading && users.length === 0 && !error ? (
        <p className="mt-4 text-[11px] text-muted-foreground">暂无用户。</p>
      ) : null}

      {editorOpen
        ? portalModal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
              role="dialog"
              aria-modal
              aria-labelledby="admin-user-editor-title"
              onPointerDown={markBackdropPointerDown}
              onClick={(e) =>
                dismissIfBackdropClick(e, () => setEditorOpen(false), !saving)
              }
            >
              <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border/80 bg-white p-5 shadow-2xl">
                <h3
                  id="admin-user-editor-title"
                  className="font-display text-lg font-semibold text-foreground"
                >
                  {editing ? "编辑用户" : "新建用户"}
                </h3>
                <div className="mt-4 space-y-3">
                  <label className="block text-[11px] font-medium text-muted-foreground">
                    登录名
                    <input
                      className={inputClass}
                      value={form.username}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, username: e.target.value }))
                      }
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-[11px] font-medium text-muted-foreground">
                    展示名
                    <input
                      className={inputClass}
                      value={form.displayName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, displayName: e.target.value }))
                      }
                    />
                  </label>
                  <label className="block text-[11px] font-medium text-muted-foreground">
                    隶属组织
                    <input
                      className={inputClass}
                      list="admin-org-suggestions"
                      placeholder="如：合域"
                      value={form.orgTitle}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, orgTitle: e.target.value }))
                      }
                    />
                    <datalist id="admin-org-suggestions">
                      {orgSuggestions.map((org) => (
                        <option key={org} value={org} />
                      ))}
                    </datalist>
                  </label>
                  {!editing ? (
                    <label className="block text-[11px] font-medium text-muted-foreground">
                      初始密码（至少 8 位）
                      <input
                        type="password"
                        className={inputClass}
                        value={form.password}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, password: e.target.value }))
                        }
                        autoComplete="new-password"
                      />
                    </label>
                  ) : (
                    <label className="block text-[11px] font-medium text-muted-foreground">
                      状态
                      <select
                        className={inputClass}
                        value={form.status}
                        disabled={editing.id === selfUserId}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            status: e.target.value as "active" | "disabled",
                          }))
                        }
                      >
                        <option value="active">启用</option>
                        <option value="disabled">停用</option>
                      </select>
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-[12px] text-foreground">
                    <input
                      type="checkbox"
                      checked={form.isPlatformAdmin}
                      disabled={Boolean(editing && editing.id === selfUserId)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          isPlatformAdmin: e.target.checked,
                        }))
                      }
                    />
                    平台管理员（可进入管理中枢）
                  </label>

                  {editing && !editing.isPlatformAdmin ? (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground">
                        项目权限
                      </p>
                      {projectsLoading ? (
                        <p className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden
                          />
                          加载项目…
                        </p>
                      ) : null}
                      <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto rounded-lg border border-border/60 bg-muted/10 p-2">
                        {projectDrafts.length === 0 && !projectsLoading ? (
                          <li className="px-1 py-2 text-[11px] text-muted-foreground">
                            暂无项目
                          </li>
                        ) : (
                          projectDrafts.map((p) => (
                            <li key={p.projectId}>
                              <div className="flex flex-wrap items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/80">
                                <input
                                  type="checkbox"
                                  className="mt-0.5"
                                  checked={p.selected}
                                  disabled={p.isCreator}
                                  onChange={() => toggleProject(p.projectId)}
                                />
                                <span className="min-w-0 flex-1 text-[12px] font-medium text-foreground">
                                  {p.name}
                                  {p.isCreator ? (
                                    <span className="ml-1 text-[10px] text-[hsl(var(--wine-deep))]">
                                      创建人
                                    </span>
                                  ) : null}
                                </span>
                                {p.selected ? (
                                  <ProjectRoleSelects
                                    role={p.role}
                                    disabled={p.isCreator}
                                    onChange={(role) =>
                                      setProjectRole(p.projectId, role)
                                    }
                                  />
                                ) : null}
                              </div>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  ) : null}

                  {editing?.isPlatformAdmin ? (
                    <p className="text-[11px] text-muted-foreground">
                      平台管理员默认可见全部项目，无需单独配置项目成员。
                    </p>
                  ) : null}
                </div>

                {error ? (
                  <p className="mt-3 rounded-lg border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-700">
                    {error}
                  </p>
                ) : null}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setEditorOpen(false)}
                    className="rounded-full border border-border/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={saving || projectsLoading}
                    onClick={() => void onSaveUser()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--wine-deep))] px-4 py-2 text-xs font-semibold text-white hover:opacity-92 disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : null}
                    保存
                  </button>
                </div>
              </div>
            </div>,
          )
        : null}

      {pwdUser
        ? portalModal(
            <div
              className="fixed inset-0 z-[210] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
              role="dialog"
              aria-modal
              aria-labelledby="admin-pwd-title"
              onPointerDown={markBackdropPointerDown}
              onClick={(e) =>
                dismissIfBackdropClick(e, () => setPwdUser(null), !pwdSaving)
              }
            >
              <div className="w-full max-w-sm rounded-xl border border-border/80 bg-white p-5 shadow-2xl">
                <h3
                  id="admin-pwd-title"
                  className="font-display text-lg font-semibold text-foreground"
                >
                  重置密码
                </h3>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  为 {pwdUser.displayName}（@{pwdUser.username}）设置新密码，至少
                  8 位。
                </p>
                <label className="mt-4 block text-[11px] font-medium text-muted-foreground">
                  新密码
                  <input
                    type="password"
                    className={inputClass}
                    value={pwdValue}
                    onChange={(e) => setPwdValue(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                {error ? (
                  <p className="mt-3 rounded-lg border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-700">
                    {error}
                  </p>
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={pwdSaving}
                    onClick={() => setPwdUser(null)}
                    className="rounded-full border border-border/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={pwdSaving || pwdValue.length < 8}
                    onClick={() => void onSavePassword()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--wine-deep))] px-4 py-2 text-xs font-semibold text-white hover:opacity-92 disabled:opacity-60"
                  >
                    {pwdSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : null}
                    确认重置
                  </button>
                </div>
              </div>
            </div>,
          )
        : null}
    </section>
  );
}
