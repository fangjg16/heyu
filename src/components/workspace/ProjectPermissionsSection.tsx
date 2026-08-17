import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Shield, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchWorkspaceUsersDirectory } from "@/lib/api-auth";
import {
  ENABLE_LIVE_CHAT,
  fetchProjectPermissions,
  updateProjectPermissions,
  type ProjectPermissionMember,
} from "@/lib/project-api";
import type { WorkspaceProject } from "@/workspace/projects";
import { patchMyProjectRole } from "@/workspace/project-role-cache";
import {
  listCachedWorkspaceUsers,
  roleLabelForProject,
} from "@/workspace/workspace-users";
import type { WorkspaceRole } from "@/workspace/types";
import {
  MemberRoleFields,
  type AssignableMemberRole,
} from "@/components/workspace/MemberRoleFields";

type ProjectPermissionsSectionProps = {
  project: WorkspaceProject;
  userId: string;
  embedded?: boolean;
  onMembersChange?: (members: ProjectPermissionMember[]) => void;
};

function prettyName(displayName: string): string {
  return displayName.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}

export function ProjectPermissionsSection({
  project,
  userId,
  embedded = false,
  onMembersChange,
}: ProjectPermissionsSectionProps) {
  const [members, setMembers] = useState<ProjectPermissionMember[] | null>(null);
  const [draft, setDraft] = useState<Record<string, WorkspaceRole>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [addKeyword, setAddKeyword] = useState("");
  const [addRole, setAddRole] = useState<AssignableMemberRole>("low");
  const onMembersChangeRef = useRef(onMembersChange);
  onMembersChangeRef.current = onMembersChange;

  const load = useCallback(async () => {
    if (!ENABLE_LIVE_CHAT) return;
    setLoading(true);
    setError(null);
    try {
      await fetchWorkspaceUsersDirectory().catch(() => {
        /* 目录缓存失败时仍可用已有成员列表 */
      });
      const data = await fetchProjectPermissions(project.id, userId);
      setMembers(data.members);
      onMembersChangeRef.current?.(data.members);
      const next: Record<string, WorkspaceRole> = {};
      for (const m of data.members) {
        if (m.isPlatformAdmin) continue;
        next[m.userId] = m.overrideRole ?? m.defaultRole;
        if (m.isCreator) {
          next[m.userId] = "core";
        }
      }
      setDraft(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMembers(null);
    } finally {
      setLoading(false);
    }
  }, [project.id, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyMembers = (next: ProjectPermissionMember[]) => {
    setMembers(next);
    onMembersChangeRef.current?.(next);
    const nextDraft: Record<string, WorkspaceRole> = {};
    for (const m of next) {
      if (m.isPlatformAdmin) continue;
      nextDraft[m.userId] = m.overrideRole ?? m.defaultRole;
      if (m.isCreator) nextDraft[m.userId] = "core";
    }
    setDraft(nextDraft);
    const self = next.find((m) => m.userId === userId);
    if (self) {
      patchMyProjectRole(project.id, self.effectiveRole);
    }
  };

  const onSave = async () => {
    if (!members) return;
    setSaving(true);
    setError(null);
    setSavedHint(null);
    try {
      const updates = members
        .filter((m) => !m.isPlatformAdmin)
        .map((m) => ({
          userId: m.userId,
          role: m.isCreator
            ? ("core" as const)
            : (draft[m.userId] ?? m.defaultRole),
        }));
      const next = await updateProjectPermissions(project.id, userId, updates);
      applyMembers(next);
      setSavedHint("权限已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onAddMember = async (option: { userId: string; name: string }) => {
    if (adding || saving || removingId) return;
    setAdding(true);
    setError(null);
    setSavedHint(null);
    try {
      const next = await updateProjectPermissions(project.id, userId, [
        { userId: option.userId, role: addRole },
      ]);
      applyMembers(next);
      setAddKeyword("");
      const kind = addRole === "issuer" ? "项目方" : roleLabelForProject(addRole);
      setSavedHint(`已加入 ${option.name}（${kind}）`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const onRemoveMember = async (member: ProjectPermissionMember) => {
    if (member.isCreator || member.isPlatformAdmin) return;
    if (adding || saving || removingId) return;
    const name = prettyName(member.displayName);
    if (!window.confirm(`确定移除「${name}」在本项目的成员身份？`)) return;

    setRemovingId(member.userId);
    setError(null);
    setSavedHint(null);
    try {
      const next = await updateProjectPermissions(project.id, userId, [
        { userId: member.userId, remove: true },
      ]);
      applyMembers(next);
      if (member.userId === userId) {
        patchMyProjectRole(project.id, "guest");
      }
      setSavedHint(`已移除 ${name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingId(null);
    }
  };

  const dirty =
    members?.some((m) => {
      if (m.isPlatformAdmin || m.isCreator) return false;
      const picked = draft[m.userId] ?? m.defaultRole;
      const current = m.overrideRole ?? m.defaultRole;
      return picked !== current;
    }) ?? false;

  const memberIds = new Set((members ?? []).map((m) => m.userId));
  const addOptions = listCachedWorkspaceUsers()
    .map((u) => ({
      userId: u.id,
      name: prettyName(u.displayName),
      searchText: `${u.displayName} ${prettyName(u.displayName)} ${u.id}`.toLowerCase(),
      isPlatformAdmin: Boolean(u.isPlatformAdmin),
    }))
    .filter((option) => {
      if (memberIds.has(option.userId)) return false;
      if (option.isPlatformAdmin) return false;
      const kw = addKeyword.trim().toLowerCase();
      if (!kw) return false;
      return option.searchText.includes(kw);
    })
    .slice(0, 8);

  const busy = saving || adding || Boolean(removingId);
  const addKindLabel =
    addRole === "issuer" ? "项目方" : roleLabelForProject(addRole);

  return (
    <section
      className={cn(
        !embedded &&
          "mt-5 rounded-2xl border border-[hsl(var(--wine-deep)/0.18)] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)]",
      )}
      aria-labelledby="project-permissions-heading"
    >
      <div className="flex items-start justify-between gap-3">
        {embedded ? (
          <p
            id="project-permissions-heading"
            className="text-[12.5px] leading-relaxed text-[hsl(var(--warm-charcoal-muted))]"
          >
            添加时先选项目方或投资方；投资方默认 Basic，也可改为 Core / 项目管理员。
          </p>
        ) : (
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--wine-deep)/0.08)] text-[hsl(var(--wine-deep))]">
              <Shield className="h-4 w-4" strokeWidth={2} aria-hidden />
            </div>
            <div>
              <h3
                id="project-permissions-heading"
                className="text-xs font-bold uppercase tracking-wide text-foreground"
              >
                项目成员
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                可添加项目方或投资方。投资方再指定项目管理员 / Core / Basic（默认
                Basic）。创建人固定为 Core；平台管理员不可在此修改。
              </p>
            </div>
          </div>
        )}
        <button
          type="button"
          disabled={!dirty || busy || loading}
          onClick={() => void onSave()}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[hsl(var(--wine-deep)/0.32)] bg-[hsl(var(--wine-deep)/0.06)] px-3 py-1.5 text-[11px] font-semibold text-[hsl(var(--wine-deep))] transition-colors hover:bg-[hsl(var(--wine-deep)/0.1)]",
            (!dirty || busy || loading) && "pointer-events-none opacity-50",
          )}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : null}
          保存
        </button>
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          加载成员…
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-700">
          {error}
        </p>
      ) : null}

      {savedHint ? (
        <p className="mt-3 text-[11px] font-medium text-emerald-700">{savedHint}</p>
      ) : null}

      {members && !loading ? (
        <>
          <div className="relative mt-4">
            <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
              添加成员
            </label>
            <MemberRoleFields
              role={addRole}
              disabled={busy}
              onChange={setAddRole}
            />
            <input
              type="text"
              value={addKeyword}
              onChange={(e) => setAddKeyword(e.target.value)}
              disabled={busy}
              placeholder="输入姓名或账号搜索后加入"
              className="mt-2 w-full rounded-lg border border-border/60 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/30"
            />
            {addOptions.length > 0 ? (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border/70 bg-white py-1 shadow-md">
                {addOptions.map((option) => (
                  <li key={option.userId}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onAddMember(option)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/60 disabled:opacity-50"
                    >
                      <Plus
                        className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--wine-deep))]"
                        aria-hidden
                      />
                      <span className="truncate">{option.name}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        加入为{addKindLabel}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {addKeyword.trim() && addOptions.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                无匹配用户，或对方已在项目中 / 为平台管理员
              </p>
            ) : null}
          </div>

          <ul className="mt-4 space-y-2">
            {members.map((m) => {
              const locked = m.isPlatformAdmin || m.isCreator;
              const removing = removingId === m.userId;
              const value = m.isCreator
                ? "core"
                : m.isPlatformAdmin
                  ? "admin"
                  : (draft[m.userId] ?? m.defaultRole);
              return (
                <li
                  key={m.userId}
                  className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Users
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <p className="truncate text-sm font-medium text-foreground">
                        {prettyName(m.displayName)}
                        {m.isCreator ? (
                          <span className="ml-1.5 text-[10px] font-semibold text-[hsl(var(--wine-deep))]">
                            创建人
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {!locked ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onRemoveMember(m)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200/80 bg-white text-rose-600 transition-colors hover:bg-rose-50 disabled:pointer-events-none disabled:opacity-50"
                        aria-label={`移除 ${prettyName(m.displayName)}`}
                        title="移除成员"
                      >
                        {removing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                    ) : null}
                  </div>
                  {locked ? (
                    <p className="text-[12px] text-[hsl(var(--warm-charcoal-muted))]">
                      {m.isPlatformAdmin
                        ? "平台管理员"
                        : `投资方 · ${roleLabelForProject("core")}（创建人固定）`}
                    </p>
                  ) : (
                    <MemberRoleFields
                      role={value}
                      disabled={busy}
                      size="sm"
                      onChange={(role) => {
                        setDraft((prev) => ({ ...prev, [m.userId]: role }));
                        setSavedHint(null);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
