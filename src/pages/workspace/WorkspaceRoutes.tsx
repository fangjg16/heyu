import { useCallback, useEffect, useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { WorkspaceErrorBoundary } from "@/components/workspace/WorkspaceErrorBoundary";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  KnowledgeDraftGeneratingDialog,
  type DraftGeneratingProgress,
} from "@/components/workspace/KnowledgeDraftGeneratingDialog";
import { ProjectKnowledgeNetworkSection } from "@/components/workspace/ProjectKnowledgeNetworkSection";
import { ProjectMaterialsSection } from "@/components/workspace/ProjectMaterialsSection";
import { ProjectOverviewPanel } from "@/components/workspace/ProjectOverviewPanel";
import { ProjectWorkspaceHeader } from "@/components/workspace/ProjectWorkspaceHeader";
import {
  canDownloadProjectMaterials,
  canManageProjectPermissions,
  canPublishProjectKnowledgeNetwork,
} from "@/workspace/project-manage";
import {
  ActiveDraftExistsError,
  createChapterDraftRun,
  ENABLE_LIVE_CHAT,
  fetchActiveChapterDraftRun,
  fetchProjectsFromApi,
  generateChapterDraftSection,
} from "@/lib/project-api";
import {
  getMergedProjects,
  setApiProjects,
} from "@/workspace/project-registry";
import { loadSessionUserId } from "@/workspace/session";
import type { WorkspaceProject } from "@/workspace/projects";
import {
  canEnterChat,
  getProjectRole,
} from "@/workspace/workspace-users";
import AdminPortal, {
  AdminApiProbeTab,
  AdminAuditTab,
  AdminDraftsTab,
  AdminKnTemplatesTab,
  AdminLlmSettingsTab,
  AdminReviseLogsTab,
  AdminSkillsTab,
  AdminUsersTab,
} from "@/pages/workspace/AdminPortal";
import ConversationCenter from "@/pages/workspace/ConversationCenter";
import HomeDashboard from "@/pages/workspace/HomeDashboard";
import KnowledgeChapterDraftReviewPage from "@/pages/workspace/KnowledgeChapterDraftReviewPage";
import Login from "@/pages/workspace/Login";
import Notifications from "@/pages/workspace/Notifications";
import ProjectOverview from "@/pages/workspace/ProjectOverview";
import RequireAuth from "@/pages/workspace/RequireAuth";
import { resolveChatEntryPathAsync } from "@/workspace/chat-entry";

function WorkspaceChatRedirect() {
  const navigate = useNavigate();
  const userId = loadSessionUserId();
  const [ready, setReady] = useState(false);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (ENABLE_LIVE_CHAT) {
        try {
          const rows = await fetchProjectsFromApi(undefined, {
            userId: userId ?? undefined,
          });
          if (!cancelled) setApiProjects(rows);
        } catch {
          /* 无 API 时列表为空 */
        }
      }
      if (!cancelled) setReady(true);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void resolveChatEntryPathAsync(userId).then((path) => {
      if (cancelled) return;
      if (!path) {
        setEmpty(true);
        return;
      }
      navigate(path, { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [ready, userId, navigate]);

  if (empty) {
    return (
      <WorkspaceShell>
        <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-8 py-16 text-center">
          <h1 className="font-display text-2xl font-semibold text-[hsl(var(--wine))]">
            还没有可进入的对话
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            对话中心挂在具体项目下。请先到项目库新建或加入一个项目，再从项目进入对话。
          </p>
          <Link
            to="/app/projects"
            className="mt-8 inline-flex h-11 items-center rounded-xl bg-[hsl(var(--wine))] px-6 text-sm font-semibold text-white hover:bg-[hsl(var(--wine-hover))]"
          >
            去项目库创建
          </Link>
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      正在进入对话中心…
    </div>
  );
}

function formatElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}小时${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

function normalizeGenerateError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "未知错误");
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return "网络中断或请求超时（服务端可能仍已写库，刷新后请核对）";
  }
  return msg;
}

function failedChaptersStorageKey(projectId: string): string {
  return `kn-failed-chapters:${projectId}`;
}

function loadFailedChapterIds(projectId: string): string[] {
  try {
    const raw = sessionStorage.getItem(failedChaptersStorageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function saveFailedChapterIds(projectId: string, ids: string[]): void {
  try {
    sessionStorage.setItem(
      failedChaptersStorageKey(projectId),
      JSON.stringify(ids),
    );
  } catch {
    /* ignore quota */
  }
}

/** 与后端 VALID_SECTION_IDS 一致的 13 个研究章节 */
const ALL_RESEARCH_CHAPTERS: { id: string; label: string }[] = [
  { id: "snapshot", label: "项目快照" },
  { id: "objectives", label: "标的概况" },
  { id: "industry", label: "行业分析" },
  { id: "legal", label: "合规分析" },
  { id: "benchmarks", label: "对标分析" },
  { id: "business", label: "业务模式" },
  { id: "returns", label: "财务与回报" },
  { id: "capabilities", label: "资源网络" },
  { id: "ownership", label: "背景调查" },
  { id: "diligence", label: "尽职调查" },
  { id: "risks", label: "风险矩阵" },
  { id: "questions", label: "待确认问题" },
  { id: "framework", label: "决策路径与法律结构" },
];

function ProjectWorkspaceLayout() {
  const { projectId = "" } = useParams();
  const { pathname, state: locationState } = useLocation();
  const navigate = useNavigate();
  const userId = loadSessionUserId() ?? "";
  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestDialog, setGuestDialog] = useState(false);
  const [overviewBusy, setOverviewBusy] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0);
  const [allChaptersBusy, setAllChaptersBusy] = useState(false);
  const [allChaptersProgress, setAllChaptersProgress] =
    useState<DraftGeneratingProgress | null>(null);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [draftDialogMode, setDraftDialogMode] = useState<"full" | "section">(
    "full",
  );
  const [draftSectionLabel, setDraftSectionLabel] = useState("");
  const [draftRunId, setDraftRunId] = useState<string | null>(null);
  const [draftDialogError, setDraftDialogError] = useState<string | null>(null);
  const [knowledgeRefreshKey, setKnowledgeRefreshKey] = useState(0);
  const [allChaptersNotice, setAllChaptersNotice] = useState<string | null>(
    null,
  );
  const [failedChapterIds, setFailedChapterIds] = useState<string[]>([]);
  const [updatingChapterIds, setUpdatingChapterIds] = useState<string[]>([]);
  const [persistedActiveRunId, setPersistedActiveRunId] = useState<
    string | null
  >(null);

  useEffect(() => {
    const published = (
      locationState as { knowledgePublishedVersion?: number } | null
    )?.knowledgePublishedVersion;
    if (published == null) return;
    setKnowledgeRefreshKey((k) => k + 1);
    setOverviewRefreshKey((k) => k + 1);
    setAllChaptersNotice(`已发布为正式版 v${published}`);
    // 清掉 state，避免重复触发刷新
    navigate(pathname, { replace: true, state: {} });
  }, [locationState, navigate, pathname]);

  useEffect(() => {
    if (!projectId || !userId || !ENABLE_LIVE_CHAT) {
      setPersistedActiveRunId(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const active = await fetchActiveChapterDraftRun(projectId, userId);
        if (cancelled) return;
        if (active?.runId) {
          setPersistedActiveRunId(active.runId);
          setDraftRunId((cur) => cur ?? active.runId);
        } else {
          setPersistedActiveRunId(null);
        }
      } catch {
        if (!cancelled) setPersistedActiveRunId(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [projectId, userId, knowledgeRefreshKey, overviewRefreshKey]);

  useEffect(() => {
    if (!projectId) {
      setFailedChapterIds([]);
      return;
    }
    setFailedChapterIds(loadFailedChapterIds(projectId));
  }, [projectId]);

  const persistFailedChapterIds = useCallback(
    (ids: string[]) => {
      setFailedChapterIds(ids);
      if (projectId) saveFailedChapterIds(projectId, ids);
    },
    [projectId],
  );

  const onChapterGenerateSucceeded = useCallback(
    (sectionId: string) => {
      setFailedChapterIds((ids) => {
        if (!ids.includes(sectionId)) return ids;
        const next = ids.filter((id) => id !== sectionId);
        if (projectId) saveFailedChapterIds(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  const onChapterGenerateFailed = useCallback(
    (sectionId: string) => {
      setFailedChapterIds((ids) => {
        if (ids.includes(sectionId)) return ids;
        const next = [...ids, sectionId];
        if (projectId) saveFailedChapterIds(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        if (ENABLE_LIVE_CHAT) {
          const rows = await fetchProjectsFromApi(undefined, {
            userId: userId || undefined,
          });
          if (!cancelled) setApiProjects(rows);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          const found =
            getMergedProjects().find((p) => p.id === projectId) ?? null;
          setProject(found);
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [projectId, userId]);

  if (loading) {
    return (
      <WorkspaceShell>
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          加载项目…
        </div>
      </WorkspaceShell>
    );
  }

  if (!project) {
    return (
      <WorkspaceShell>
        <div className="mx-auto max-w-lg px-8 py-16 text-center">
          <h1 className="font-display text-2xl font-semibold">未找到项目</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            该项目不存在，或你没有访问权限。
          </p>
          <Link
            to="/app/projects"
            className="mt-6 inline-flex h-10 items-center rounded-xl bg-[hsl(var(--wine))] px-5 text-sm font-medium text-white"
          >
            返回项目库
          </Link>
        </div>
      </WorkspaceShell>
    );
  }

  const role = getProjectRole(userId, project.id, project.createdBy);
  const chatOk = canEnterChat(role);
  const canUpdateOverview = canPublishProjectKnowledgeNetwork(userId, project);
  const tab = pathname.includes("/knowledge")
    ? "knowledge"
    : pathname.includes("/materials")
      ? "materials"
      : "overview";

  const goChat = () => {
    if (!chatOk) {
      setGuestDialog(true);
      return;
    }
    navigate(`/app/chat/${project.id}`);
  };

  const onUpdateOverview = async () => {
    if (!canUpdateOverview || overviewBusy || allChaptersBusy) return;
    const startedAt = Date.now();
    const label = "项目概览";
    setOverviewBusy(true);
    setOverviewError(null);
    setAllChaptersNotice(null);
    setDraftDialogError(null);
    setDraftRunId(null);
    setDraftDialogMode("section");
    setDraftSectionLabel(label);
    setDraftDialogOpen(true);
    setAllChaptersProgress({
      done: 0,
      total: 1,
      failed: 0,
      elapsedMs: 0,
      phase: "creating",
      lastLabel: label,
    });

    const tick = window.setInterval(() => {
      setAllChaptersProgress((prev) =>
        prev ? { ...prev, elapsedMs: Date.now() - startedAt } : prev,
      );
    }, 1000);

    try {
      const created = await createChapterDraftRun(project.id, userId, {
        scope: "section",
        sectionId: "project-overview",
      });
      const runId = created.run.id;
      setDraftRunId(runId);

      if (created.reused && created.run.status === "ready") {
        const item = created.items.find(
          (i) => i.sectionId === "project-overview",
        );
        const ok = item?.status === "ok" || item?.hasHtml;
        setAllChaptersProgress({
          done: 1,
          total: 1,
          failed: ok ? 0 : 1,
          elapsedMs: Date.now() - startedAt,
          phase: "done",
          lastLabel: label,
        });
        if (!ok) {
          setDraftDialogError(
            "已有概览草案但生成失败，请放弃后重试，或进入审核查看。",
          );
        } else {
          setAllChaptersNotice("已有待审核的项目概览草案，可直接进入审核。");
        }
        return;
      }

      const item = created.items.find(
        (i) => i.sectionId === "project-overview",
      );
      const needGenerate =
        !created.reused ||
        !item ||
        item.status === "pending" ||
        item.status === "failed";

      setAllChaptersProgress({
        done: needGenerate ? 0 : 1,
        total: 1,
        failed: 0,
        elapsedMs: Date.now() - startedAt,
        phase: needGenerate ? "generating" : "done",
        lastLabel: label,
      });

      if (needGenerate) {
        try {
          await generateChapterDraftSection(
            project.id,
            runId,
            "project-overview",
            userId,
          );
          setAllChaptersProgress({
            done: 1,
            total: 1,
            failed: 0,
            elapsedMs: Date.now() - startedAt,
            phase: "done",
            lastLabel: label,
          });
          setAllChaptersNotice("项目概览草案已就绪，可进入审核。");
        } catch (e) {
          const message = normalizeGenerateError(e);
          setAllChaptersProgress({
            done: 1,
            total: 1,
            failed: 1,
            elapsedMs: Date.now() - startedAt,
            phase: "done",
            lastLabel: label,
          });
          setDraftDialogError(message);
        }
      }
    } catch (e) {
      if (e instanceof ActiveDraftExistsError) {
        setDraftRunId(e.activeRunId);
        setPersistedActiveRunId(e.activeRunId);
        setDraftDialogOpen(false);
        setOverviewError(null);
        setAllChaptersNotice(
          `${e.message} 可直接继续审核未完成的草案。`,
        );
        setAllChaptersProgress(null);
      } else {
        const message = normalizeGenerateError(e);
        setDraftDialogError(message);
        setOverviewError(`创建概览更新草案失败：${message}`);
        setAllChaptersProgress((prev) =>
          prev
            ? { ...prev, phase: "done", elapsedMs: Date.now() - startedAt }
            : prev,
        );
      }
    } finally {
      window.clearInterval(tick);
      setOverviewBusy(false);
    }
  };

  const onUpdateAllChapters = async () => {
    if (!canUpdateOverview || allChaptersBusy || overviewBusy) return;
    const total = ALL_RESEARCH_CHAPTERS.length;
    const startedAt = Date.now();
    setAllChaptersBusy(true);
    setUpdatingChapterIds([]);
    setOverviewError(null);
    setAllChaptersNotice(null);
    setDraftDialogError(null);
    persistFailedChapterIds([]);
    setDraftRunId(null);
    setDraftDialogMode("full");
    setDraftSectionLabel("");
    setDraftDialogOpen(true);
    setAllChaptersProgress({
      done: 0,
      total,
      failed: 0,
      elapsedMs: 0,
      phase: "creating",
    });

    const tick = window.setInterval(() => {
      setAllChaptersProgress((prev) =>
        prev ? { ...prev, elapsedMs: Date.now() - startedAt } : prev,
      );
    }, 1000);

    let runId: string | null = null;
    try {
      const created = await createChapterDraftRun(project.id, userId, {
        scope: "full",
      });
      runId = created.run.id;
      setDraftRunId(runId);

      // 已有可审核草案：不再重跑生成
      if (created.reused && created.run.status === "ready") {
        const done = created.run.progressDone || total;
        const failed = created.run.failedCount || 0;
        setAllChaptersProgress({
          done,
          total: created.run.progressTotal || total,
          failed,
          elapsedMs: Date.now() - startedAt,
          phase: "done",
        });
        setAllChaptersNotice("已有待审核草案，可直接进入审核。");
        return;
      }

      const pendingChapters = ALL_RESEARCH_CHAPTERS.filter((ch) => {
        if (!created.reused) return true;
        const item = created.items.find((i) => i.sectionId === ch.id);
        return !item || item.status === "pending" || item.status === "failed";
      });
      const alreadyOk = total - pendingChapters.length;

      setAllChaptersProgress({
        done: alreadyOk,
        total,
        failed: 0,
        elapsedMs: Date.now() - startedAt,
        phase: "generating",
      });

      // 并行写入草案，不触碰正式章节
      const results = await Promise.allSettled(
        pendingChapters.map(async (ch) => {
          try {
            await generateChapterDraftSection(
              project.id,
              runId!,
              ch.id,
              userId,
            );
            setAllChaptersProgress((prev) => ({
              done: (prev?.done ?? 0) + 1,
              total: prev?.total ?? total,
              lastLabel: ch.label,
              failed: prev?.failed ?? 0,
              elapsedMs: Date.now() - startedAt,
              phase: "generating",
            }));
            return { id: ch.id, label: ch.label };
          } catch (e) {
            const message = normalizeGenerateError(e);
            setAllChaptersProgress((prev) => ({
              done: (prev?.done ?? 0) + 1,
              total: prev?.total ?? total,
              lastLabel: ch.label,
              failed: (prev?.failed ?? 0) + 1,
              elapsedMs: Date.now() - startedAt,
              phase: "generating",
            }));
            throw Object.assign(new Error(`${ch.label}：${message}`), {
              sectionId: ch.id,
            });
          }
        }),
      );

      const failedIds = results.flatMap((r, i) =>
        r.status === "rejected" ? [pendingChapters[i]!.id] : [],
      );
      persistFailedChapterIds(failedIds);

      const successCount = total - failedIds.length;
      const elapsedLabel = formatElapsedMs(Date.now() - startedAt);
      setAllChaptersProgress((prev) =>
        prev
          ? {
              ...prev,
              done: total,
              failed: failedIds.length,
              elapsedMs: Date.now() - startedAt,
              phase: "done",
            }
          : prev,
      );

      if (pendingChapters.length === 0) {
        setAllChaptersNotice("更新草案已就绪，可进入审核。");
      } else if (failedIds.length === pendingChapters.length && successCount === 0) {
        setDraftDialogError(
          `全部章节草案生成失败，耗时 ${elapsedLabel}。可关闭后重试。`,
        );
      } else if (failedIds.length > 0) {
        setDraftDialogError(
          `草案完成：成功 ${successCount}/${total}，失败 ${failedIds.length}，耗时 ${elapsedLabel}。可前往审核（失败章将跳过）。`,
        );
      } else {
        setAllChaptersNotice(
          `更新草案已就绪：${successCount}/${total}，耗时 ${elapsedLabel}。可进入审核。`,
        );
      }
    } catch (e) {
      if (e instanceof ActiveDraftExistsError) {
        setDraftRunId(e.activeRunId);
        setPersistedActiveRunId(e.activeRunId);
        setDraftDialogOpen(false);
        setOverviewError(null);
        setAllChaptersNotice(
          `${e.message} 可直接继续审核未完成的草案。`,
        );
        setAllChaptersProgress(null);
      } else {
        const message = normalizeGenerateError(e);
        setDraftDialogError(message);
        setOverviewError(`创建更新草案失败：${message}`);
        setAllChaptersProgress((prev) =>
          prev
            ? { ...prev, phase: "done", elapsedMs: Date.now() - startedAt }
            : prev,
        );
      }
    } finally {
      window.clearInterval(tick);
      setAllChaptersBusy(false);
      setUpdatingChapterIds([]);
    }
  };

  const resumeRunId = draftRunId || persistedActiveRunId;

  const goDraftReview = () => {
    const id = resumeRunId;
    if (!id || !project) return;
    setDraftDialogOpen(false);
    navigate(`/app/projects/${project.id}/knowledge/review/${id}`);
  };

  return (
    <WorkspaceShell contentClassName="!overflow-y-auto">
      <div>
        <ProjectWorkspaceHeader
          project={project}
          userId={userId}
          tab={tab}
          onUpload={() => navigate(`/app/projects/${project.id}/materials`)}
          onChat={goChat}
          onUpdateOverview={() => void onUpdateOverview()}
          overviewBusy={overviewBusy}
          canUpdateOverview={canUpdateOverview}
          onUpdateAllChapters={() => void onUpdateAllChapters()}
          allChaptersBusy={allChaptersBusy}
          canUpdateAllChapters={canUpdateOverview}
          onResumeDraft={goDraftReview}
          showResumeDraft={Boolean(resumeRunId)}
          allChaptersProgress={null}
        />

        {overviewError ? (
          <div className="mx-auto max-w-[1600px] px-8 pt-3 md:px-10">
            <p className="rounded-xl border border-[rgba(160,99,88,0.25)] bg-[rgba(160,99,88,0.06)] px-3.5 py-2 text-[12.5px] text-[#A06358]">
              {overviewError}
            </p>
          </div>
        ) : null}

        {allChaptersNotice ||
        (resumeRunId &&
          allChaptersProgress?.phase === "done" &&
          !draftDialogOpen) ||
        (persistedActiveRunId && !draftDialogOpen) ? (
          <div className="mx-auto max-w-[1600px] px-8 pt-3 md:px-10">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgba(94,155,117,0.28)] bg-[rgba(94,155,117,0.08)] px-3.5 py-2 text-[12.5px] text-[#2F6B4F]">
              <p>
                {allChaptersNotice ??
                  (persistedActiveRunId
                    ? "本项目有未完成的章节更新草案，可继续审核或发布剩余章节。"
                    : "更新草案已就绪，可进入审核对照差异并发布。")}
              </p>
              {resumeRunId ? (
                <button
                  type="button"
                  onClick={goDraftReview}
                  className="shrink-0 font-semibold text-[#A06358] underline-offset-2 hover:underline"
                >
                  继续审核草案
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mx-auto max-w-[1600px] px-8 py-6 pb-12 md:px-10">
          <Outlet
            context={{
              overviewRefreshKey,
              knowledgeRefreshKey,
              allChaptersBusy,
              updatingChapterIds,
              failedChapterIds,
              onChapterGenerateSucceeded,
              onChapterGenerateFailed,
            }}
          />
        </div>
      </div>

      {guestDialog ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-[14px] border border-[rgba(78,66,57,0.12)] bg-[hsl(var(--paper))] p-6 shadow-2xl">
            <h2 className="text-base font-bold">无法进入对话</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              当前项目权限不足，无法进入对话中心。
            </p>
            <button
              type="button"
              onClick={() => setGuestDialog(false)}
              className="mt-5 w-full rounded-xl bg-[hsl(var(--wine))] py-2.5 text-sm font-semibold text-white"
            >
              知道了
            </button>
          </div>
        </div>
      ) : null}

      <KnowledgeDraftGeneratingDialog
        open={draftDialogOpen}
        progress={allChaptersProgress}
        runId={draftRunId}
        error={draftDialogError}
        mode={draftDialogMode}
        sectionLabel={draftSectionLabel}
        onClose={() => setDraftDialogOpen(false)}
        onGoReview={goDraftReview}
      />
    </WorkspaceShell>
  );
}

function ProjectOverviewTab() {
  const { projectId = "" } = useParams();
  const userId = loadSessionUserId() ?? "";
  const project = getMergedProjects().find((p) => p.id === projectId);
  const { overviewRefreshKey = 0 } = useOutletContext<{
    overviewRefreshKey?: number;
  }>();
  if (!project) return null;
  return (
    <ProjectOverviewPanel
      project={project}
      userId={userId}
      refreshKey={overviewRefreshKey}
    />
  );
}

function ProjectKnowledgeTab() {
  const { projectId = "" } = useParams();
  const userId = loadSessionUserId() ?? "";
  const project = getMergedProjects().find((p) => p.id === projectId);
  const role = getProjectRole(userId, projectId, project?.createdBy);
  const {
    knowledgeRefreshKey = 0,
    updatingChapterIds = [],
    failedChapterIds = [],
    onChapterGenerateSucceeded,
    onChapterGenerateFailed,
  } = useOutletContext<{
    knowledgeRefreshKey?: number;
    updatingChapterIds?: string[];
    failedChapterIds?: string[];
    onChapterGenerateSucceeded?: (sectionId: string) => void;
    onChapterGenerateFailed?: (sectionId: string) => void;
  }>();
  return (
    <ProjectKnowledgeNetworkSection
      projectId={projectId}
      userId={userId}
      project={project}
      isGuest={role === "guest"}
      refreshKey={knowledgeRefreshKey}
      updatingChapterIds={updatingChapterIds}
      failedChapterIds={failedChapterIds}
      onChapterGenerateSucceeded={onChapterGenerateSucceeded}
      onChapterGenerateFailed={onChapterGenerateFailed}
    />
  );
}

function ProjectMaterialsTab() {
  const { projectId = "" } = useParams();
  const userId = loadSessionUserId() ?? "";
  const project = getMergedProjects().find((p) => p.id === projectId);
  if (!project) return null;
  return (
    <ProjectMaterialsSection
      projectId={projectId}
      userId={userId}
      canManage={canManageProjectPermissions(userId, project)}
      canDownload={canDownloadProjectMaterials(userId, project)}
    />
  );
}

export default function WorkspaceRoutes() {
  return (
    <div className="workspace-app min-h-screen bg-[hsl(var(--linen))] text-foreground antialiased">
      <Routes>
        <Route path="login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route index element={<Navigate to="/app/home" replace />} />
          <Route
            path="home"
            element={
              <WorkspaceErrorBoundary>
                <HomeDashboard />
              </WorkspaceErrorBoundary>
            }
          />
          <Route
            path="notifications"
            element={
              <WorkspaceErrorBoundary>
                <Notifications />
              </WorkspaceErrorBoundary>
            }
          />
          <Route
            path="projects"
            element={
              <WorkspaceErrorBoundary>
                <ProjectOverview />
              </WorkspaceErrorBoundary>
            }
          />
          <Route
            path="projects/:projectId/knowledge/review/:runId"
            element={
              <WorkspaceErrorBoundary>
                <KnowledgeChapterDraftReviewPage />
              </WorkspaceErrorBoundary>
            }
          />
          <Route
            path="projects/:projectId"
            element={
              <WorkspaceErrorBoundary>
                <ProjectWorkspaceLayout />
              </WorkspaceErrorBoundary>
            }
          >
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<ProjectOverviewTab />} />
            <Route path="knowledge" element={<ProjectKnowledgeTab />} />
            <Route path="materials" element={<ProjectMaterialsTab />} />
          </Route>
          <Route
            path="admin"
            element={
              <WorkspaceErrorBoundary>
                <AdminPortal />
              </WorkspaceErrorBoundary>
            }
          >
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsersTab />} />
            <Route path="skills" element={<AdminSkillsTab />} />
            <Route path="kn-templates" element={<AdminKnTemplatesTab />} />
            <Route path="llm" element={<AdminLlmSettingsTab />} />
            <Route path="api-probe" element={<AdminApiProbeTab />} />
            <Route path="audit" element={<AdminAuditTab />} />
            <Route path="drafts" element={<AdminDraftsTab />} />
            <Route path="revise-logs" element={<AdminReviseLogsTab />} />
          </Route>
          <Route path="settings" element={<Navigate to="/app/admin/users" replace />} />
          <Route path="chat" element={<WorkspaceChatRedirect />} />
          <Route
            path="chat/:projectId/:conversationId"
            element={
              <WorkspaceErrorBoundary>
                <ConversationCenter />
              </WorkspaceErrorBoundary>
            }
          />
          <Route
            path="chat/:projectId"
            element={
              <WorkspaceErrorBoundary>
                <ConversationCenter />
              </WorkspaceErrorBoundary>
            }
          />
        </Route>
      </Routes>
    </div>
  );
}
