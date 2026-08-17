import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { MessageSquare, RefreshCw, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import {
  ENABLE_LIVE_CHAT,
  fetchProjectPermissions,
  type ProjectPermissionMember,
} from "@/lib/project-api";
import { canManageProjectPermissions } from "@/workspace/project-manage";
import { judgmentFromPhase } from "@/workspace/project-judgment";
import type { WorkspaceProject } from "@/workspace/projects";
import {
  getProjectRole,
  getUserById,
  roleLabelForProject,
} from "@/workspace/workspace-users";
import type { WorkspaceRole } from "@/workspace/types";
import { ProjectPermissionsSection } from "@/components/workspace/ProjectPermissionsSection";

const AVATAR_TONES = [
  "#A06358",
  "#3F6F63",
  "#B07d1f",
  "#5E7A9B",
  "#8B5E6B",
] as const;

function markFromName(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  if (/^[A-Za-z]/.test(t)) {
    const parts = t.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[\s-]+/);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
    }
    return t.slice(0, 2).toUpperCase();
  }
  return t.slice(0, 1);
}

type MemberChip = { userId: string; name: string; mark: string; bg: string };

function chipsFromMembers(members: ProjectPermissionMember[]): MemberChip[] {
  return members.slice(0, 5).map((m, i) => ({
    userId: m.userId,
    name: m.displayName || m.userId,
    mark: markFromName(m.displayName || m.userId),
    bg: AVATAR_TONES[i % AVATAR_TONES.length]!,
  }));
}

function chipsFromFallback(
  project: WorkspaceProject,
  userId: string,
): MemberChip[] {
  const chips: MemberChip[] = [];
  const creator = (project.createdBy ?? "").trim();
  if (creator) {
    const u = getUserById(creator);
    const name = u?.displayName ?? creator;
    chips.push({
      userId: creator,
      name,
      mark: markFromName(name),
      bg: AVATAR_TONES[0]!,
    });
  }
  const uid = userId.trim();
  if (uid && uid !== creator) {
    const u = getUserById(uid);
    const name = u?.displayName ?? uid;
    chips.push({
      userId: uid,
      name,
      mark: markFromName(name),
      bg: AVATAR_TONES[1]!,
    });
  }
  return chips.slice(0, 5);
}

type ProjectWorkspaceHeaderProps = {
  project: WorkspaceProject;
  userId: string;
  tab: "overview" | "knowledge" | "materials" | "collab";
  onUpload: () => void;
  onChat: () => void;
  onUpdateOverview?: () => void;
  overviewBusy?: boolean;
  canUpdateOverview?: boolean;
  onUpdateAllChapters?: () => void;
  allChaptersBusy?: boolean;
  canUpdateAllChapters?: boolean;
  allChaptersProgress?: {
    done: number;
    total: number;
    lastLabel?: string;
    failed: number;
    elapsedMs: number;
  } | null;
};

function formatElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}小时${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

export function ProjectWorkspaceHeader({
  project,
  userId,
  tab,
  onUpload,
  onChat,
  onUpdateOverview,
  overviewBusy = false,
  canUpdateOverview = false,
  onUpdateAllChapters,
  allChaptersBusy = false,
  canUpdateAllChapters = false,
  allChaptersProgress = null,
}: ProjectWorkspaceHeaderProps) {
  const navigate = useNavigate();
  const role = getProjectRole(userId, project.id, project.createdBy);
  const judgment = judgmentFromPhase(project.phase);
  const canManage = canManageProjectPermissions(userId, project);
  const [members, setMembers] = useState<ProjectPermissionMember[] | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<
    null | "overview" | "all-chapters"
  >(null);
  useBodyScrollLock(confirmKind !== null || membersOpen);

  useEffect(() => {
    if (!ENABLE_LIVE_CHAT || !userId || !canManage) {
      setMembers(null);
      return;
    }
    let cancelled = false;
    void fetchProjectPermissions(project.id, userId)
      .then((data) => {
        if (!cancelled) setMembers(data.members);
      })
      .catch(() => {
        if (!cancelled) setMembers(null);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, userId, canManage]);

  const avatarChips = useMemo(() => {
    if (members && members.length > 0) return chipsFromMembers(members);
    return chipsFromFallback(project, userId);
  }, [members, project, userId]);

  const tabs: {
    id: "overview" | "knowledge" | "materials" | "collab";
    label: string;
    to: string;
  }[] = [
    {
      id: "overview",
      label: "项目概览",
      to: `/app/projects/${project.id}/overview`,
    },
    {
      id: "knowledge",
      label: "知识网络",
      to: `/app/projects/${project.id}/knowledge`,
    },
    {
      id: "materials",
      label: "源文件",
      to: `/app/projects/${project.id}/materials`,
    },
    {
      id: "collab",
      label: "项目方协作",
      to: `/app/projects/${project.id}/collab`,
    },
  ];

  const confirmCopy =
    confirmKind === "overview"
      ? {
          title: "确认更新概览",
          body: "将根据模板与已上传资料生成「项目概览」更新草案（含时间轴与关系图）。正式版本不会被覆盖，需审核后再发布。确定开始？",
          confirmLabel: "开始更新概览",
        }
      : confirmKind === "all-chapters"
        ? {
            title: "确认更新全部章节",
            body: "将并行生成全部知识网络章节的更新草案。正式版本不会被覆盖，生成完成后可进入审核页对照差异再发布。耗时可能较长。确定开始？",
            confirmLabel: "开始更新全部章节",
          }
        : null;

  const onConfirmStart = () => {
    if (confirmKind === "overview") {
      setConfirmKind(null);
      onUpdateOverview?.();
      return;
    }
    if (confirmKind === "all-chapters") {
      setConfirmKind(null);
      onUpdateAllChapters?.();
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] px-8 pt-6 md:px-10">
      <button
        type="button"
        onClick={() => navigate("/app/projects")}
        className="mb-3.5 flex items-center gap-1.5 text-[13px] text-[hsl(var(--wine))]"
      >
        ← 返回项目列表
      </button>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3.5">
            <h1 className="font-display text-[32px] font-semibold tracking-wide text-[hsl(var(--warm-charcoal))]">
              {project.name}
            </h1>
            <span
              className="rounded-full px-3 py-1 text-[12.5px] font-medium"
              style={{ background: judgment.bg, color: judgment.fg }}
            >
              {judgment.label}
            </span>
            <span className="rounded-md bg-[rgba(78,66,57,0.07)] px-2.5 py-0.5 text-xs text-[hsl(var(--warm-charcoal-muted))]">
              {roleLabelForProject(role as WorkspaceRole)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {avatarChips.length > 0 ? (
            canManage ? (
              <button
                type="button"
                onClick={() => setMembersOpen(true)}
                title="管理项目成员"
                className="mr-1 flex items-center rounded-full p-0.5 transition-colors hover:bg-[hsl(var(--wine)/0.08)]"
              >
                <span className="flex">
                  {avatarChips.map((m, i) => (
                    <span
                      key={m.userId}
                      title={m.name}
                      className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#F6F3EE] text-[11px] font-bold text-white"
                      style={{
                        background: m.bg,
                        marginLeft: i === 0 ? 0 : -8,
                        zIndex: avatarChips.length - i,
                      }}
                    >
                      {m.mark}
                    </span>
                  ))}
                </span>
                <span className="ml-2 pr-1 text-[12.5px] text-[hsl(var(--warm-charcoal-muted))]">
                  成员
                </span>
              </button>
            ) : (
              <div className="mr-1 flex">
                {avatarChips.map((m, i) => (
                  <div
                    key={m.userId}
                    title={m.name}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#F6F3EE] text-[11px] font-bold text-white"
                    style={{
                      background: m.bg,
                      marginLeft: i === 0 ? 0 : -8,
                      zIndex: avatarChips.length - i,
                    }}
                  >
                    {m.mark}
                  </div>
                ))}
              </div>
            )
          ) : canManage ? (
            <button
              type="button"
              onClick={() => setMembersOpen(true)}
              className="mr-1 h-8 rounded-full border border-[rgba(78,66,57,0.16)] px-3 text-[12.5px] text-[hsl(var(--wine))] hover:bg-[hsl(var(--wine-muted))]"
            >
              管理成员
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setConfirmKind("overview")}
            disabled={
              !canUpdateOverview ||
              overviewBusy ||
              allChaptersBusy ||
              !onUpdateOverview
            }
            title={
              canUpdateOverview
                ? "生成项目概览更新草案（正式版本不会被覆盖），审核后再发布"
                : "无权限更新项目概览"
            }
            className="inline-flex h-10 items-center gap-1.5 rounded-[11px] border border-[rgba(78,66,57,0.18)] bg-transparent px-4 text-[13.5px] font-medium text-[#59625F] transition-colors hover:border-[hsl(var(--wine)/0.3)] hover:bg-[hsl(var(--wine-muted))] hover:text-[hsl(var(--wine))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", overviewBusy && "animate-spin")}
              strokeWidth={2}
            />
            {overviewBusy ? "生成草案中…" : "更新概览"}
          </button>
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex h-10 items-center gap-1.5 rounded-[11px] border border-[hsl(var(--wine)/0.3)] bg-transparent px-4 text-[13.5px] font-medium text-[hsl(var(--wine))] hover:bg-[hsl(var(--wine-muted))]"
          >
            <Upload className="h-3.5 w-3.5" strokeWidth={2} />
            上传资料
          </button>
          <button
            type="button"
            onClick={onChat}
            className="inline-flex h-10 items-center gap-1.5 rounded-[11px] bg-[hsl(var(--wine))] px-[18px] text-[13.5px] font-medium text-white hover:bg-[hsl(var(--wine-hover))]"
          >
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
            进入对话
          </button>
          <button
            type="button"
            onClick={() => setConfirmKind("all-chapters")}
            disabled={
              !canUpdateAllChapters ||
              allChaptersBusy ||
              overviewBusy ||
              !onUpdateAllChapters
            }
            title={
              canUpdateAllChapters
                ? "生成全部章节更新草案（正式版本不会被覆盖）"
                : "无权限更新知识网络章节"
            }
            className="inline-flex h-10 items-center gap-1.5 rounded-[11px] border border-[hsl(var(--wine)/0.35)] bg-[hsl(var(--wine-muted))] px-4 text-[13.5px] font-medium text-[hsl(var(--wine))] transition-colors hover:bg-[#EFE7E6] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", allChaptersBusy && "animate-spin")}
              strokeWidth={2}
            />
            {allChaptersBusy ? "生成草案中…" : "更新全部章节"}
          </button>
        </div>
      </div>

      {allChaptersBusy && allChaptersProgress ? (
        <div className="mt-3.5 rounded-[12px] border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.85)] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
            <span className="font-medium text-[#1F2423]">
              更新全部章节 {allChaptersProgress.done}/{allChaptersProgress.total}
              {allChaptersProgress.lastLabel
                ? ` · 最近完成：${allChaptersProgress.lastLabel}`
                : ""}
              {` · 已用时 ${formatElapsedMs(allChaptersProgress.elapsedMs)}`}
            </span>
            {allChaptersProgress.failed > 0 ? (
              <span className="text-[#A06358]">
                失败 {allChaptersProgress.failed}
              </span>
            ) : (
              <span className="text-[#59625F]">并行生成中</span>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgba(78,66,57,0.1)]">
            <div
              className="h-full bg-[#A06358] transition-[width] duration-300"
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    (allChaptersProgress.done / allChaptersProgress.total) *
                      100,
                  ),
                )}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-end gap-1 border-b border-[rgba(78,66,57,0.12)]">
        {tabs.map((t) => (
          <Link
            key={t.id}
            to={t.to}
            className={cn(
              "mb-[-1px] inline-flex h-[42px] items-end px-4 pb-2.5 text-sm leading-none transition-colors",
              tab === t.id
                ? "border-b-2 border-[hsl(var(--wine))] font-semibold text-[hsl(var(--wine))]"
                : "border-b-2 border-transparent font-normal text-[hsl(var(--warm-charcoal-muted))] hover:text-[hsl(var(--warm-charcoal))]",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {confirmCopy && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
              role="dialog"
              aria-modal
              aria-labelledby="project-update-confirm-title"
              onClick={(e) => {
                if (e.target === e.currentTarget) setConfirmKind(null);
              }}
            >
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-[rgba(78,66,57,0.12)] bg-white shadow-2xl">
                <div className="border-b border-[rgba(78,66,57,0.1)] px-5 py-4">
                  <h3
                    id="project-update-confirm-title"
                    className="font-display text-lg font-semibold text-[#1F2423]"
                  >
                    {confirmCopy.title}
                  </h3>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-[#59625F]">
                    {confirmCopy.body}
                  </p>
                </div>
                <div className="flex justify-end gap-2 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setConfirmKind(null)}
                    className="rounded-full border border-[rgba(78,66,57,0.14)] px-4 py-2 text-xs font-semibold text-[#1F2423] hover:bg-[rgba(78,66,57,0.05)]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={onConfirmStart}
                    className="rounded-full bg-[hsl(var(--wine))] px-4 py-2 text-xs font-semibold text-white hover:bg-[hsl(var(--wine-hover))]"
                  >
                    {confirmCopy.confirmLabel}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {membersOpen && canManage && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-members-title"
              onClick={(e) => {
                if (e.target === e.currentTarget) setMembersOpen(false);
              }}
            >
              <div className="flex max-h-[min(86vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/80 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                  <h3
                    id="project-members-title"
                    className="font-display text-base font-semibold text-foreground"
                  >
                    项目成员
                  </h3>
                  <button
                    type="button"
                    onClick={() => setMembersOpen(false)}
                    className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                    aria-label="关闭"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <ProjectPermissionsSection
                    project={project}
                    userId={userId}
                    embedded
                    onMembersChange={setMembers}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
