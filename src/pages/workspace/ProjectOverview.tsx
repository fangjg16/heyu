import { useEffect, useRef, useState } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, FileText, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { projectMatchesQuery } from "@/workspace/project-search";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { ProjectEditModal } from "@/components/workspace/ProjectEditModal";
import { cn } from "@/lib/utils";
import {
  normalizeProjectPhase,
  type ProjectPhase,
  type WorkspaceProject,
} from "@/workspace/projects";
import {
  createJoinRequest,
  createProjectViaApi,
  deleteProjectViaApi,
  ENABLE_LIVE_CHAT,
  AI_CHAT_ENDPOINT,
  fetchMyJoinRequests,
  fetchMyProjectRoles,
  fetchProjectsFromApi,
  uploadProjectPackageFile,
  PROJECT_UPLOAD_FOLDER,
} from "@/lib/project-api";
import { loadSessionUserId } from "@/workspace/session";
import {
  getMergedProjects,
  removeApiProject,
  setApiProjects,
  sortProjectsForOverview,
  subscribeApiProjects,
  upsertApiProject,
} from "@/workspace/project-registry";
import { useMyProjectRoles } from "@/hooks/use-my-project-roles";
import { setMyProjectRoles } from "@/workspace/project-role-cache";
import { filterProjectsForUser } from "@/workspace/guest-access";
import { canUserManageProjectMetadata } from "@/workspace/project-manage";
import {
  getProjectRole,
  getUserById,
  isAccountGuestUser,
  listCachedWorkspaceUsers,
  roleLabelForProject,
} from "@/workspace/workspace-users";
import { fetchWorkspaceUsersDirectory } from "@/lib/api-auth";
import type { WorkspaceRole } from "@/workspace/types";

const CREATE_PERMISSION_OPTIONS = ["core", "mid", "low"] as const;
type CreatePermission = (typeof CREATE_PERMISSION_OPTIONS)[number];
type CreateParticipant = { userId: string; name: string; permission: CreatePermission };
type ProjectOpenness = "partial" | "invite";

const PROJECT_OPENNESS_OPTIONS: {
  value: ProjectOpenness;
  title: string;
  description: string;
}[] = [
  {
    value: "partial",
    title: "全开放",
    description:
      "内部账号可在项目广场发现该项目；未加入成员仅为访客级，可申请加入。",
  },
  {
    value: "invite",
    title: "内部邀请",
    description:
      "仅创建人与已加入成员可在项目库看到该项目；请明确选择参与人。",
  },
];

function prettyMemberName(displayName: string): string {
  const spaced = displayName.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return spaced || displayName;
}

const PHASE_BADGE_CLASS: Record<ProjectPhase, string> = {
  "Active（资源筹备中）":
    "rounded-sm border border-[hsl(145_18%_78%)] bg-[hsl(145_22%_93%)] text-[hsl(145_24%_30%)]",
  "Completed（已签约）":
    "rounded-sm border border-[hsl(var(--wine-deep)/0.35)] bg-[hsl(var(--wine-muted)/0.55)] text-[hsl(var(--wine-deep))]",
  "Paused（暂停）":
    "rounded-sm border border-[hsl(var(--terracotta)/0.38)] bg-[hsl(32_26%_93%)] text-[hsl(22_28%_38%)]",
  "Cancelled（已取消）":
    "rounded-sm border border-[hsl(var(--sand))] bg-[hsl(var(--warm-charcoal)/0.06)] text-[hsl(var(--warm-charcoal-muted))]",
};

function phaseChipText(phase: ProjectPhase | undefined): string {
  const safe = normalizeProjectPhase(phase);
  const english = safe.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "ACTIVE";
  const cn = safe.match(/（(.+?)）/)?.[1] ?? "";
  return `${english} ${cn}`.trim();
}

function phaseBadgeClass(phase: ProjectPhase | undefined): string {
  return PHASE_BADGE_CLASS[normalizeProjectPhase(phase)];
}

/** 卡片脚注用短标签 */
function roleFootnote(role: WorkspaceRole): string {
  return roleLabelForProject(role);
}

function ownerDisplayName(createdBy: string | null | undefined): string {
  const id = (createdBy ?? "").trim();
  if (!id) return "—";
  const u = getUserById(id);
  const name = (u?.displayName ?? id).trim();
  return prettyMemberName(name) || "—";
}

/** 项目广场：展示全开放项目（含本人已加入的，便于核对开放程度） */
function isPlazaDiscoverable(project: WorkspaceProject): boolean {
  const o = String(project.openness ?? "").trim().toLowerCase();
  return o !== "invite";
}

function ProjectCard({
  project,
  userId,
  onEnter,
  onRequestJoin,
  onEdit,
  onDelete,
  requested,
  joining,
}: {
  project: WorkspaceProject;
  userId: string;
  onEnter: () => void;
  onRequestJoin?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  requested?: boolean;
  joining?: boolean;
}) {
  const role = getProjectRole(userId, project.id, project.createdBy);
  const isMember = role !== "guest";
  const canManage = canUserManageProjectMetadata(userId, project);
  const roleLabel = isMember ? roleFootnote(role) : "Guest";
  const previewText = role === "guest" ? project.guestSummary : project.summary;
  const owner = ownerDisplayName(project.createdBy);
  // 红线 / 待补资料暂无结构化 API：诚实占位
  const redlinesDisplay = "—";
  const gapsDisplay = "—";
  const maturity =
    typeof project.researchMaturity === "number"
      ? Math.max(0, Math.min(100, Math.round(project.researchMaturity)))
      : null;
  const maturityLabel = maturity == null ? "—" : `${maturity}%`;
  const maturityWidth = maturity == null ? "0%" : `${maturity}%`;
  const mark = (() => {
    const t = project.name.trim();
    if (!t) return "项";
    if (/^[A-Za-z]/.test(t)) return t.slice(0, 3).toUpperCase();
    return t.slice(0, 2);
  })();

  const actionLabel = isMember
    ? "进入项目"
    : joining
      ? "申请中…"
      : requested
        ? "已申请"
        : "申请加入";

  const onAction = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (isMember) onEnter();
    else if (!requested && !joining && onRequestJoin) onRequestJoin();
  };

  return (
    <article
      className={cn(
        "flex flex-col rounded-[20px] border border-[rgba(255,255,255,0.6)] bg-[rgba(255,252,248,0.76)] p-[22px] shadow-[0_10px_30px_rgba(102,80,60,0.08)] backdrop-blur-[18px] transition-shadow hover:shadow-[0_14px_36px_rgba(102,80,60,0.14)]"
      )}
    >
      <div className="flex items-start gap-3.5">
        <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--wine-muted))] font-display text-[15px] font-bold text-[hsl(var(--wine))]">
          {mark}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[19px] font-semibold leading-snug text-[hsl(var(--warm-charcoal))]">
              {project.name}
            </h2>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                phaseBadgeClass(project.phase)
              )}
            >
              {phaseChipText(project.phase)}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                isMember
                  ? "bg-[rgba(94,155,117,0.13)] text-[#3F6F63]"
                  : "bg-[rgba(78,66,57,0.08)] text-[hsl(var(--warm-charcoal-muted))]"
              )}
            >
              {roleLabel}
            </span>
          </div>
          <p className="mt-[3px] text-[12.5px] text-[hsl(var(--warm-charcoal-muted))]">
            {project.category || "投研项目"}
          </p>
        </div>
        {canManage ? (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              title="编辑项目"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.();
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--warm-charcoal-muted))] hover:bg-[hsl(var(--wine)/0.08)] hover:text-[hsl(var(--wine))]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="删除项目"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--warm-charcoal-muted))] hover:bg-[hsl(var(--wine)/0.08)] hover:text-[hsl(var(--wine))]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
      <p className="mt-4 line-clamp-3 flex-1 text-[13.5px] leading-[1.75] text-[hsl(var(--warm-charcoal-muted))]">
        {previewText}
      </p>
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-[11.5px] text-[#59625F]">
          <span>研究成熟度</span>
          <span>{maturityLabel}</span>
        </div>
        <div
          title={`研究成熟度 ${maturityLabel}`}
          className="h-[7px] overflow-hidden rounded-[3px] bg-[rgba(78,66,57,0.14)]"
        >
          <div
            className="h-full rounded-[3px] bg-[#5E9B75] transition-[width] duration-300"
            style={{ width: maturityWidth }}
          />
        </div>
      </div>
      <div className="mt-4 flex gap-[22px] border-t border-[rgba(78,66,57,0.1)] pt-3.5">
        <div>
          <div className="text-[11px] text-[#59625F]">红线风险</div>
          <div className="mt-0.5 text-[15px] font-semibold text-[#59625F]">
            {redlinesDisplay}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[#59625F]">待补资料</div>
          <div className="mt-0.5 text-[15px] font-semibold text-[hsl(var(--warm-charcoal))]">
            {gapsDisplay}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-[#59625F]">负责人</div>
          <div className="mt-1 truncate text-[13px] font-medium text-[hsl(var(--warm-charcoal))]">
            {owner}
          </div>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onAction}
          disabled={!isMember && (requested || joining)}
          className={cn(
            "inline-flex h-[34px] shrink-0 items-center gap-1.5 self-end rounded-[9px] px-3 text-[13px] font-medium transition-colors",
            isMember
              ? "border border-transparent bg-transparent text-[hsl(var(--wine))] hover:bg-[hsl(var(--wine)/0.06)]"
              : requested || joining
                ? "cursor-default border border-[rgba(78,66,57,0.1)] bg-[rgba(78,66,57,0.06)] text-[#969E9A]"
                : "border border-[rgba(160,99,88,0.28)] bg-transparent text-[hsl(var(--wine))] hover:bg-[hsl(var(--wine-muted))]"
          )}
        >
          {actionLabel}
          {isMember || (!requested && !joining) ? (
            <ArrowRight className="h-3.5 w-3.5" />
          ) : null}
        </button>
      </div>
    </article>
  );
}

export default function ProjectOverview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";
  const [userId, setUserId] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<"all" | ProjectPhase>("all");
  const [roleFilter, setRoleFilter] = useState<"all" | WorkspaceRole>("all");
  const [portfolioTab, setPortfolioTab] = useState<"mine" | "plaza">("mine");
  const [pendingJoinIds, setPendingJoinIds] = useState<string[]>([]);
  const [joiningProjectId, setJoiningProjectId] = useState<string | null>(null);
  const [joinToast, setJoinToast] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDetail, setNewProjectDetail] = useState("");
  const [newProjectOpenness, setNewProjectOpenness] = useState<ProjectOpenness>("partial");
  const [participantKeyword, setParticipantKeyword] = useState("");
  const [participants, setParticipants] = useState<CreateParticipant[]>([]);
  const [newProjectFiles, setNewProjectFiles] = useState<File[]>([]);
  const [createHint, setCreateHint] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsLoadError, setProjectsLoadError] = useState<string | null>(null);
  const [apiProjectsTick, setApiProjectsTick] = useState(0);
  const [editProject, setEditProject] = useState<WorkspaceProject | null>(null);
  const [deleteProject, setDeleteProject] = useState<WorkspaceProject | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useBodyScrollLock(
    Boolean(showCreateModal || createHint || editProject || deleteProject),
  );

  useEffect(() => {
    const id = loadSessionUserId();
    if (!id) {
      navigate("/app/login", { replace: true });
      return;
    }
    setUserId(id);
  }, [navigate]);

  useEffect(
    () => subscribeApiProjects(() => setApiProjectsTick((n) => n + 1)),
    [],
  );

  const rolesVersion = useMyProjectRoles(userId);

  useEffect(() => {
    if (!userId || !ENABLE_LIVE_CHAT) return;
    void fetchWorkspaceUsersDirectory().catch(() => {
      /* 参与人搜索依赖缓存，失败时为空列表 */
    });
  }, [userId]);

  useEffect(() => {
    if (!userId || !ENABLE_LIVE_CHAT) return;
    let cancelled = false;
    setProjectsLoading(true);
    setProjectsLoadError(null);
    void Promise.all([
      fetchProjectsFromApi(AI_CHAT_ENDPOINT, { userId }),
      fetchMyJoinRequests().catch(() => [] as Awaited<ReturnType<typeof fetchMyJoinRequests>>),
    ])
      .then(([rows, joins]) => {
        if (cancelled) return;
        setApiProjects(rows);
        setPendingJoinIds(
          joins.filter((j) => j.status === "pending").map((j) => j.projectId),
        );
      })
      .catch((e) => {
        if (!cancelled) {
          setProjectsLoadError(
            e instanceof Error ? e.message : "项目列表同步失败，请稍后刷新",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const user = getUserById(userId);
  // rolesVersion / apiProjectsTick：缓存更新后强制重算列表
  void rolesVersion;
  void apiProjectsTick;
  const visibleProjects = sortProjectsForOverview(
    filterProjectsForUser(userId ?? "", getMergedProjects()),
  );
  const phaseOptions = Array.from(new Set(visibleProjects.map((p) => p.phase)));
  const roleOptions = userId
    ? Array.from(
        new Set(
          visibleProjects.map((p) => getProjectRole(userId, p.id, p.createdBy))
        )
      )
    : [];
  const filteredProjects = userId
    ? visibleProjects.filter((p) => {
        const role = getProjectRole(userId, p.id, p.createdBy);
        if (portfolioTab === "mine" && role === "guest") return false;
        if (portfolioTab === "plaza" && !isPlazaDiscoverable(p)) return false;
        if (phaseFilter !== "all" && p.phase !== phaseFilter) return false;
        if (roleFilter !== "all" && role !== roleFilter) return false;
        if (!projectMatchesQuery(p, searchQuery)) return false;
        return true;
      })
    : [];
  const memberCount = userId
    ? visibleProjects.filter(
        (p) => getProjectRole(userId, p.id, p.createdBy) !== "guest"
      ).length
    : 0;
  const plazaCount = userId
    ? visibleProjects.filter((p) => isPlazaDiscoverable(p)).length
    : 0;

  const resetCreateForm = () => {
    setNewProjectName("");
    setNewProjectDetail("");
    setNewProjectOpenness("partial");
    setParticipantKeyword("");
    setParticipants([]);
    setNewProjectFiles([]);
    setCreatingProject(false);
  };

  const confirmCreateProject = () => {
    if (creatingProject || !userId) return;
    const name = newProjectName.trim();
    if (!name) {
      setCreateHint("请先填写项目名称。");
      return;
    }
    if (!ENABLE_LIVE_CHAT) {
      setCreateHint("未配置线上 API（VITE_AI_CHAT_ENDPOINT），无法创建项目。");
      return;
    }
    setCreatingProject(true);
    void (async () => {
      try {
        const project = await createProjectViaApi({
          name,
          detail: newProjectDetail.trim() || undefined,
          openness: newProjectOpenness,
          userId,
          participants: participants.map((p) => ({
            userId: p.userId,
            role: p.permission,
          })),
        });
        try {
          const roles = await fetchMyProjectRoles(userId);
          setMyProjectRoles(roles);
        } catch {
          /* 角色缓存刷新失败不阻断 */
        }
        upsertApiProject(project);
        const files = [...newProjectFiles];
        const uploadErrors: string[] = [];
        for (const file of files) {
          try {
            await uploadProjectPackageFile(project.id, userId, file, {
              relativePath: PROJECT_UPLOAD_FOLDER,
            });
          } catch (e) {
            uploadErrors.push(
              `${file.name}：${e instanceof Error ? e.message : "上传失败"}`,
            );
          }
        }
        setShowCreateModal(false);
        resetCreateForm();
        const uploadNote =
          uploadErrors.length > 0
            ? `\n\n部分附件未上传成功：\n${uploadErrors.join("\n")}`
            : files.length > 0
              ? `\n\n已上传 ${files.length - uploadErrors.length} 个资料包文件。`
              : "";
        setCreateHint(
          `项目「${project.name}」已保存。可从「我的项目」进入工作台继续完善。${uploadNote}`,
        );
      } catch (e) {
        setCreateHint(
          e instanceof Error ? e.message : "创建项目失败，请稍后重试。",
        );
      } finally {
        setCreatingProject(false);
      }
    })();
  };

  const participantOptions = listCachedWorkspaceUsers()
    .map((u) => ({
      userId: u.id,
      name: prettyMemberName(u.displayName),
      searchText: `${u.displayName} ${prettyMemberName(u.displayName)} ${u.id}`.toLowerCase(),
    }))
    .filter((option) => {
    const kw = participantKeyword.trim().toLowerCase();
    if (!kw) return false;
      return option.searchText.includes(kw);
    })
    .filter((option) => !participants.some((p) => p.userId === option.userId));

  const addParticipant = (option: { userId: string; name: string }) => {
    setParticipants((prev) => {
      if (prev.some((p) => p.userId === option.userId)) return prev;
      return [...prev, { userId: option.userId, name: option.name, permission: "mid" }];
    });
    setParticipantKeyword("");
  };

  const removeParticipant = (userId: string) => {
    setParticipants((prev) => prev.filter((p) => p.userId !== userId));
  };

  const updateParticipantPermission = (userId: string, permission: CreatePermission) => {
    setParticipants((prev) =>
      prev.map((p) => (p.userId === userId ? { ...p, permission } : p))
    );
  };

  const addDemoFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    setNewProjectFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`));
      const merged = [...prev];
      picked.forEach((f) => {
        const key = `${f.name}-${f.size}-${f.lastModified}`;
        if (!seen.has(key)) merged.push(f);
      });
      return merged;
    });
  };

  const removeDemoFile = (idx: number) => {
    setNewProjectFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  if (!userId || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        加载中…
      </div>
    );
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto w-full max-w-[1600px] px-8 py-8 md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-display text-[32px] font-semibold tracking-wide">
              项目库
            </h1>
            <p className="mt-2 text-[hsl(var(--warm-charcoal-muted))]">
              管理已加入项目；全开放项目会出现在项目广场，供内部账号发现与申请加入。
            </p>
            {projectsLoading ? (
              <p className="mt-2 text-xs text-[hsl(var(--warm-charcoal-muted))]">
                正在同步云端项目...
              </p>
            ) : null}
            {projectsLoadError ? (
              <p className="mt-2 text-xs text-amber-700">{projectsLoadError}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowCreateModal(true);
              setCreateHint(null);
            }}
            className="inline-flex h-[42px] items-center gap-2 rounded-xl bg-[hsl(var(--wine))] px-5 text-sm font-medium text-white hover:bg-[hsl(var(--wine-hover))]"
          >
            <Plus className="h-[18px] w-[18px]" />
            新建项目
          </button>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          <div className="flex gap-1.5">
            {(
              [
                { key: "mine" as const, label: `我的项目 ${memberCount}` },
                {
                  key: "plaza" as const,
                  label: `项目广场 ${plazaCount}`,
                },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setPortfolioTab(t.key)}
                className={cn(
                  "h-[34px] rounded-[9px] px-4 text-[13px] transition-colors",
                  portfolioTab === t.key
                    ? "bg-[hsl(var(--wine-muted))] font-semibold text-[hsl(var(--wine))]"
                    : "bg-transparent font-normal text-[hsl(var(--warm-charcoal-muted))] hover:bg-[hsl(var(--wine)/0.05)]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex gap-2">
            <label className="flex h-[34px] items-center gap-1.5 rounded-[9px] border border-[rgba(78,66,57,0.14)] bg-[rgba(255,252,248,0.6)] px-3 text-[12.5px] text-[hsl(var(--warm-charcoal-muted))]">
              <select
                value={phaseFilter}
                onChange={(e) =>
                  setPhaseFilter(e.target.value as "all" | ProjectPhase)
                }
                className="bg-transparent outline-none"
              >
                <option value="all">全部项目状态</option>
                {phaseOptions.map((phase) => (
                  <option key={phase} value={phase}>
                    {phase}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-[34px] items-center gap-1.5 rounded-[9px] border border-[rgba(78,66,57,0.14)] bg-[rgba(255,252,248,0.6)] px-3 text-[12.5px] text-[hsl(var(--warm-charcoal-muted))]">
              <select
                value={roleFilter}
                onChange={(e) =>
                  setRoleFilter(e.target.value as "all" | WorkspaceRole)
                }
                className="bg-transparent outline-none"
              >
                <option value="all">全部权限</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {roleLabelForProject(role)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {filteredProjects.length > 0 ? (
          <div className="mt-[18px] grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                userId={userId!}
                requested={pendingJoinIds.includes(p.id)}
                joining={joiningProjectId === p.id}
                onEnter={() => navigate(`/app/projects/${p.id}/overview`)}
                onEdit={() => setEditProject(p)}
                onDelete={() => {
                  setDeleteError(null);
                  setDeleteProject(p);
                }}
                onRequestJoin={() => {
                  if (!ENABLE_LIVE_CHAT) {
                    setJoinToast("未配置线上 API，无法提交加入申请。");
                    window.setTimeout(() => setJoinToast(null), 3200);
                    return;
                  }
                  if (joiningProjectId) return;
                  setJoiningProjectId(p.id);
                  void createJoinRequest(p.id)
                    .then((req) => {
                      if (req.status === "pending") {
                        setPendingJoinIds((prev) =>
                          prev.includes(p.id) ? prev : [...prev, p.id],
                        );
                      }
                      setJoinToast(`已提交加入「${p.name}」的申请，请等待项目负责人审批。`);
                      window.setTimeout(() => setJoinToast(null), 3200);
                    })
                    .catch((e) => {
                      const pending = (
                        e as Error & { request?: { projectId?: string; status?: string } }
                      )?.request;
                      if (pending?.status === "pending" && pending.projectId) {
                        setPendingJoinIds((prev) =>
                          prev.includes(pending.projectId!)
                            ? prev
                            : [...prev, pending.projectId!],
                        );
                      }
                      setJoinToast(
                        e instanceof Error ? e.message : "申请加入失败，请稍后重试。",
                      );
                      window.setTimeout(() => setJoinToast(null), 3600);
                    })
                    .finally(() => setJoiningProjectId(null));
                }}
              />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.82)] px-6 py-10 text-center">
            <p className="font-display text-lg font-semibold text-[hsl(var(--wine))]">
              {searchQuery.trim()
                ? "未找到匹配项目"
                : portfolioTab === "mine"
                  ? "暂无已加入项目"
                  : "暂无全开放项目"}
            </p>
            <p className="mt-2 text-sm text-[hsl(var(--warm-charcoal-muted))]">
              {searchQuery.trim()
                ? "尝试更换关键词，或清除搜索后浏览全部项目。"
                : portfolioTab === "mine"
                  ? "切换到项目广场浏览全开放协作机会，或新建项目。"
                  : isAccountGuestUser(userId)
                    ? "暂无可见项目。请联系管理员将您加入成员。"
                    : "将项目开放程度设为「全开放」后会出现在此；内部邀请项目仅成员可见。"}
            </p>
          </div>
        )}
      </div>

      {joinToast ? (
        <div className="fixed bottom-8 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2.5 rounded-xl bg-[hsl(var(--warm-charcoal))] px-[22px] py-3 text-[13.5px] text-white shadow-[0_14px_36px_rgba(102,80,60,0.3)]">
          {joinToast}
        </div>
      ) : null}

      {showCreateModal ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm animate-in fade-in duration-200 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-title"
        >
          <div className="flex max-h-[min(86vh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[hsl(var(--sand)/0.9)] bg-white shadow-[0_24px_56px_-24px_rgba(46,30,28,0.45)] animate-in zoom-in-95 slide-in-from-bottom-2 duration-200 ease-out sm:max-w-lg">
            <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
              <div className="min-w-0 pr-2">
                <h2
                  id="create-project-title"
                  className="font-display text-base font-semibold text-[hsl(var(--wine-deep))] sm:text-[1.05rem]"
                >
                  新建项目
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-[hsl(var(--warm-charcoal-muted))]">
                  基础信息与参考附件
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-5 sm:py-3">
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[hsl(var(--warm-charcoal))]">
                  项目名称
                </span>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="请输入项目名称"
                  className="w-full rounded-lg border border-[hsl(var(--sand)/0.9)] bg-white px-2.5 py-2 text-sm outline-none transition focus:border-[hsl(var(--wine-deep)/0.45)] focus:ring-1 focus:ring-[hsl(var(--wine-deep)/0.12)]"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[hsl(var(--warm-charcoal))]">
                  项目详情
                </span>
                <textarea
                  value={newProjectDetail}
                  onChange={(e) => setNewProjectDetail(e.target.value)}
                  rows={3}
                  placeholder="简介、结构、里程碑与资源需求（选填）"
                  className="w-full resize-none rounded-lg border border-[hsl(var(--sand)/0.9)] bg-white px-2.5 py-2 text-sm leading-relaxed outline-none transition focus:border-[hsl(var(--wine-deep)/0.45)] focus:ring-1 focus:ring-[hsl(var(--wine-deep)/0.12)]"
                />
              </label>

              <div>
                <span className="mb-1 block text-xs font-medium text-[hsl(var(--warm-charcoal))]">
                  项目开放程度
                </span>
                <select
                  value={newProjectOpenness}
                  onChange={(e) => setNewProjectOpenness(e.target.value as ProjectOpenness)}
                  className="w-full rounded-lg border border-[hsl(var(--sand)/0.9)] bg-white px-2.5 py-2 text-sm text-[hsl(var(--warm-charcoal))] outline-none transition focus:border-[hsl(var(--wine-deep)/0.45)] focus:ring-1 focus:ring-[hsl(var(--wine-deep)/0.12)]"
                >
                  {PROJECT_OPENNESS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.title}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--warm-charcoal-muted))]">
                  {
                    PROJECT_OPENNESS_OPTIONS.find((item) => item.value === newProjectOpenness)
                      ?.description
                  }
                </p>
              </div>

              <div>
                <span className="mb-1 block text-xs font-medium text-[hsl(var(--warm-charcoal))]">
                  参与人员与权限
                </span>
                <div className="rounded-lg border border-[hsl(var(--sand)/0.9)] bg-[hsl(var(--linen)/0.35)] p-2.5">
                  <div className="relative">
                    <input
                      type="text"
                      value={participantKeyword}
                      onChange={(e) => setParticipantKeyword(e.target.value)}
                      placeholder="请输入成员名/昵称"
                      className="w-full rounded-lg border border-border/60 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary/30"
                    />
                    {participantOptions.length > 0 ? (
                      <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border/70 bg-white shadow-lg">
                        {participantOptions.map((option) => (
                          <li key={option.userId}>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                addParticipant(option);
                              }}
                              className="flex w-full items-center px-3 py-2 text-left text-sm text-foreground transition hover:bg-primary/10"
                            >
                              {option.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {participants.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {participants.map((member) => (
                        <li
                          key={member.userId}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border/65 bg-muted/10 px-3 py-2"
                        >
                          <span className="text-sm font-medium text-foreground">{member.name}</span>
                          <div className="flex items-center gap-2">
                            <select
                              value={member.permission}
                              onChange={(e) =>
                                updateParticipantPermission(
                                  member.userId,
                                  e.target.value as CreatePermission
                                )
                              }
                              className="rounded-md border border-border/60 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-primary/30"
                            >
                              {CREATE_PERMISSION_OPTIONS.map((perm) => (
                                <option key={perm} value={perm}>
                                  {roleLabelForProject(perm)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => removeParticipant(member.userId)}
                              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label={`移除 ${member.name}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      不选人则仅创建人入组。选中的人将加入项目并获得对应权限；其他人仅为访客级。
                    </p>
                  )}
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-medium text-[hsl(var(--warm-charcoal))]">
                  参考附件
                </span>
                <div className="rounded-lg border border-dashed border-[hsl(var(--sand))] bg-[hsl(var(--linen)/0.4)] p-2.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--sand)/0.9)] bg-white px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--warm-charcoal))] transition hover:border-[hsl(var(--wine-deep)/0.35)]"
                  >
                    <Upload className="h-3.5 w-3.5 text-[hsl(var(--wine-deep))]" />
                    选择文件
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={(e) => {
                      addDemoFiles(e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    已选择 {newProjectFiles.length} 个文件
                  </p>
                  {newProjectFiles.length > 0 ? (
                    <ul className="mt-2 max-h-28 space-y-1.5 overflow-y-auto pr-0.5">
                      {newProjectFiles.map((f, idx) => (
                        <li
                          key={`${f.name}-${f.size}-${f.lastModified}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border/65 bg-white px-3 py-2 text-xs"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-primary/80" />
                            <span className="truncate">{f.name}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => removeDemoFile(idx)}
                            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="移除附件"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">尚未选择附件。</p>
                  )}
                </div>
              </div>
            </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 bg-[hsl(var(--linen)/0.5)] px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => {
                  if (creatingProject) return;
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
                className="rounded-lg border border-[hsl(var(--sand)/0.9)] bg-white px-3 py-1.5 text-xs font-medium text-[hsl(var(--warm-charcoal))] transition hover:bg-white/80 sm:text-sm sm:px-3.5 sm:py-2"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmCreateProject}
                disabled={creatingProject}
                className="rounded-lg border border-[hsl(var(--wine-deep))] bg-[hsl(var(--wine-deep))] px-3.5 py-1.5 text-xs font-semibold text-[hsl(var(--wine-deep-foreground))] transition hover:bg-[hsl(353_42%_28%)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-90 sm:text-sm sm:px-4 sm:py-2"
              >
                {creatingProject ? "创建中..." : "确定"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createHint ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/25 p-4 backdrop-blur-[1px] animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-result-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-150 ease-out">
            <h3 id="create-result-title" className="text-base font-bold text-emerald-900">
              创建结果
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-emerald-800">{createHint}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setCreateHint(null)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editProject && userId ? (
        <ProjectEditModal
          projectId={editProject.id}
          project={editProject}
          userId={userId}
          open
          onClose={() => setEditProject(null)}
          onSaved={(project) => {
            upsertApiProject(project);
            setEditProject(null);
          }}
        />
      ) : null}

      {deleteProject ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
        >
          <div className="w-full max-w-md rounded-xl border border-[hsl(var(--sand)/0.9)] bg-white p-5 shadow-2xl">
            <h3
              id="delete-project-title"
              className="font-display text-base font-semibold text-[hsl(var(--wine-deep))]"
            >
              删除项目
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--warm-charcoal-muted))]">
              确认删除「{deleteProject.name}」？将从项目库隐藏；资料、对话与知识网络等数据会保留，前台不可恢复显示。
            </p>
            {deleteError ? (
              <p className="mt-3 text-sm text-amber-800">{deleteError}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingProject}
                onClick={() => {
                  setDeleteProject(null);
                  setDeleteError(null);
                }}
                className="rounded-lg border border-[hsl(var(--sand)/0.9)] bg-white px-3.5 py-2 text-sm font-medium"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deletingProject || !userId}
                onClick={() => {
                  if (!userId || deletingProject) return;
                  setDeletingProject(true);
                  setDeleteError(null);
                  void deleteProjectViaApi(deleteProject.id, userId)
                    .then(() => {
                      removeApiProject(deleteProject.id);
                      setPendingJoinIds((prev) =>
                        prev.filter((id) => id !== deleteProject.id),
                      );
                      setDeleteProject(null);
                    })
                    .catch((e) => {
                      setDeleteError(
                        e instanceof Error ? e.message : "删除失败，请稍后重试",
                      );
                    })
                    .finally(() => setDeletingProject(false));
                }}
                className="rounded-lg bg-[hsl(var(--wine))] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[hsl(var(--wine-hover))] disabled:opacity-60"
              >
                {deletingProject ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
