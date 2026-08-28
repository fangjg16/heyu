import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import {
  DISCARD_THEN_REGENERATE_HINT,
  KnowledgeDraftGeneratingDialog,
  type DraftGeneratingProgress,
} from "@/components/workspace/KnowledgeDraftGeneratingDialog";
import {
  ActiveDraftExistsError,
  DraftRunDiscardedError,
  createChapterDraftRun,
  discardChapterDraftRun,
  fetchActiveChapterDraftRun,
  fetchKnowledgeChapterVersion,
  fetchOverviewVersion,
  fetchProjectKnowledgeChapter,
  listKnowledgeChapterVersions,
  listProjectKnowledgeChapters,
  reviseProjectKnowledgeChapter,
  rollbackKnowledgeChapterVersion,
  waitForDraftRunSettled,
  type KnowledgeChapterVersionMeta,
  type OverviewVersionMeta,
} from "@/lib/project-api";
import { stripAuthoringHintsFromHtml } from "@/lib/strip-authoring-hints";
import { formatChapterVersionLabel, formatOverviewVersionLabel } from "@/lib/chapter-version";
import {
  ProjectRelationGraph,
  parseProjectGraphHtml,
} from "@/components/workspace/ProjectRelationGraph";
import { extractOpenQuestionTitle } from "@/lib/kn-citations";
import {
  parseOpenQuestionsFromHtml,
  pickRelatedOpenQuestions,
} from "@/lib/open-questions-parse";
import { canPublishProjectKnowledgeNetwork, canUpdateProjectKnowledgeNetwork } from "@/workspace/project-manage";
import {
  dismissIfBackdropClick,
  markBackdropPointerDown,
} from "@/lib/backdrop-dismiss";
import {
  projectPhaseLabel,
  type WorkspaceProject,
} from "@/workspace/projects";

type KnowledgeView = "chapters" | "sources" | "glossary" | "versions";

type ChapterGroup = {
  id: string;
  label: string;
  sections: { id: string; label: string }[];
};

/** 与原型 petChapterGroups / peptideChapterGroups 一致的静态目录 */
const CHAPTER_GROUPS: ChapterGroup[] = [
  {
    id: "overview",
    label: "项目概况",
    sections: [
      { id: "snapshot", label: "项目快照" },
      { id: "objectives", label: "标的概况" },
    ],
  },
  {
    id: "research",
    label: "基础研究",
    sections: [
      { id: "industry", label: "行业分析" },
      { id: "legal", label: "合规分析" },
      { id: "benchmarks", label: "对标分析" },
    ],
  },
  {
    id: "structure",
    label: "方案与回报",
    sections: [
      { id: "business", label: "业务模式" },
      { id: "returns", label: "财务与回报" },
      { id: "capabilities", label: "资源网络" },
      { id: "ownership", label: "背景调查" },
      { id: "diligence", label: "尽职调查" },
    ],
  },
  {
    id: "risk",
    label: "风险与决策",
    sections: [
      { id: "risks", label: "风险矩阵" },
      { id: "questions", label: "待确认问题" },
      { id: "framework", label: "决策路径与法律结构" },
    ],
  },
];

const RESEARCH_SECTION_IDS = CHAPTER_GROUPS.flatMap((g) =>
  g.sections.map((s) => s.id),
);
const RESEARCH_CHAPTER_COUNT = RESEARCH_SECTION_IDS.length;

function allChaptersConfirmText(input: {
  loading: boolean;
  hasDraft: boolean;
  published: number;
  failed: number;
  total: number;
}): string {
  if (input.loading) return "正在查看当前进度…";
  const pending = Math.max(0, input.total - input.published);
  if (input.hasDraft && input.published > 0 && pending > 0) {
    return `${input.published} 章已发布、${pending} 章还在草案里。已发布的正式章不会改。`;
  }
  if (input.hasDraft && input.failed > 0) {
    return `将重试失败的 ${input.failed} 章，已成功待审核的会保留。`;
  }
  if (input.hasDraft) {
    return `已有待审核草案，不会重新生成。${DISCARD_THEN_REGENERATE_HINT}`;
  }
  if (input.published > 0) {
    return "将生成新的全部章节草案。已发布的正式章在发布前不会改变。";
  }
  return "将更新全部章节，可能需要几分钟。";
}

function resolveSectionLocation(sectionRaw: string | null): {
  groupId: string;
  sectionId: string;
} | null {
  const sid = (sectionRaw ?? "").trim();
  if (!sid) return null;
  for (const g of CHAPTER_GROUPS) {
    if (g.sections.some((s) => s.id === sid)) {
      return { groupId: g.id, sectionId: sid };
    }
  }
  return null;
}

function formatVersionTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

const VIEW_TABS: { id: KnowledgeView; label: string }[] = [
  { id: "chapters", label: "章节" },
  { id: "sources", label: "引用来源" },
  { id: "glossary", label: "名词解释" },
  { id: "versions", label: "版本记录" },
];

type ProjectKnowledgeNetworkSectionProps = {
  projectId: string;
  userId?: string;
  project?: WorkspaceProject;
  isGuest?: boolean;
  refreshKey?: number;
  updatingChapterIds?: string[];
  failedChapterIds?: string[];
  onChapterGenerateSucceeded?: (sectionId: string) => void;
  onChapterGenerateFailed?: (sectionId: string) => void;
  allChaptersBusy?: boolean;
  overviewBusy?: boolean;
  canUpdateAllChapters?: boolean;
  onUpdateAllChapters?: (regen?: "unpublished" | "all-drafts") => void;
};

export function ProjectKnowledgeNetworkSection({
  projectId,
  userId = "",
  project,
  isGuest = false,
  refreshKey = 0,
  updatingChapterIds = [],
  failedChapterIds = [],
  onChapterGenerateSucceeded,
  onChapterGenerateFailed,
  allChaptersBusy = false,
  overviewBusy = false,
  canUpdateAllChapters = false,
  onUpdateAllChapters,
}: ProjectKnowledgeNetworkSectionProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialLoc = resolveSectionLocation(searchParams.get("section"));
  const [view, setView] = useState<KnowledgeView>("chapters");
  const [groupId, setGroupId] = useState(
    () => initialLoc?.groupId ?? CHAPTER_GROUPS[0]!.id,
  );
  const [sectionId, setSectionId] = useState(
    () => initialLoc?.sectionId ?? CHAPTER_GROUPS[0]!.sections[0]!.id,
  );
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [draftRunId, setDraftRunId] = useState<string | null>(null);
  const [draftDialogError, setDraftDialogError] = useState<string | null>(null);
  const [draftStopping, setDraftStopping] = useState(false);
  const [draftProgress, setDraftProgress] =
    useState<DraftGeneratingProgress | null>(null);
  const [draftSectionLabel, setDraftSectionLabel] = useState("");
  const [draftDialogReused, setDraftDialogReused] = useState(false);

  const [html, setHtml] = useState<string | null>(null);
  const [questionsHtml, setQuestionsHtml] = useState<string | null>(null);
  const [sourcesHtml, setSourcesHtml] = useState<string | null>(null);
  const [glossaryHtml, setGlossaryHtml] = useState<string | null>(null);
  const [loadingChapter, setLoadingChapter] = useState(false);
  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingGlossary, setLoadingGlossary] = useState(false);
  const [busyBySection, setBusyBySection] = useState<
    Record<string, "generate" | "revise">
  >({});
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const chatRef = useRef<HTMLTextAreaElement>(null);
  const sourcesPaneRef = useRef<HTMLDivElement>(null);
  const pendingCiteIdRef = useRef<string | null>(null);
  const sectionIdRef = useRef(sectionId);
  sectionIdRef.current = sectionId;

  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [versionMetas, setVersionMetas] = useState<
    KnowledgeChapterVersionMeta[]
  >([]);
  const [currentBundleVersion, setCurrentBundleVersion] = useState(1);
  const [browsingVersion, setBrowsingVersion] = useState<number | null>(null);
  const [versionChapters, setVersionChapters] = useState<
    { sectionId: string; html: string }[]
  >([]);
  const [versionSectionId, setVersionSectionId] = useState(
    CHAPTER_GROUPS[0]!.sections[0]!.id,
  );
  const [versionDetailLoading, setVersionDetailLoading] = useState(false);
  const [rollbackBusy, setRollbackBusy] = useState<number | null>(null);
  const [versionRefresh, setVersionRefresh] = useState(0);
  const [overviewVersionMetas, setOverviewVersionMetas] = useState<
    OverviewVersionMeta[]
  >([]);
  const [currentOverviewVersion, setCurrentOverviewVersion] = useState(0);
  const [browsingOverviewVersion, setBrowsingOverviewVersion] = useState<
    number | null
  >(null);
  const [overviewBrowseHtml, setOverviewBrowseHtml] = useState<string | null>(
    null,
  );
  const [overviewBrowseKnVersion, setOverviewBrowseKnVersion] = useState(0);
  const [overviewBrowseGraph, setOverviewBrowseGraph] = useState<
    ReturnType<typeof parseProjectGraphHtml>
  >(null);
  const [liveEditing, setLiveEditing] = useState(false);
  const [liveEditBusy, setLiveEditBusy] = useState(false);
  const chapterPaneRef = useRef<HTMLDivElement>(null);
  const [allChaptersConfirm, setAllChaptersConfirm] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmHasDraft, setConfirmHasDraft] = useState(false);
  const [confirmPublished, setConfirmPublished] = useState(0);
  const [confirmFailed, setConfirmFailed] = useState(0);
  useBodyScrollLock(allChaptersConfirm);

  const flatSections = useMemo(
    () => CHAPTER_GROUPS.flatMap((g) => g.sections),
    [],
  );

  useEffect(() => {
    const loc = resolveSectionLocation(searchParams.get("section"));
    if (!loc) return;
    setView("chapters");
    setGroupId(loc.groupId);
    setSectionId(loc.sectionId);
  }, [searchParams]);

  useEffect(() => {
    const viewParam = searchParams.get("view");
    const cite = searchParams.get("cite")?.trim();
    if (cite) pendingCiteIdRef.current = cite;
    if (viewParam === "sources" || cite) {
      setView("sources");
    } else if (viewParam === "glossary") {
      setView("glossary");
    } else if (viewParam === "versions") {
      setView("versions");
    }
  }, [searchParams]);

  useEffect(() => {
    if (view !== "versions" || !projectId || !userId.trim() || isGuest) return;
    let cancelled = false;
    const run = async () => {
      setVersionsLoading(true);
      setVersionsError(null);
      try {
        const data = await listKnowledgeChapterVersions(projectId, userId);
        if (cancelled) return;
        setVersionMetas(data.versions);
        setCurrentBundleVersion(data.currentVersion);
        setOverviewVersionMetas(data.overviewVersions);
        setCurrentOverviewVersion(data.overviewVersion);
      } catch (e) {
        if (!cancelled) {
          setVersionsError(
            e instanceof Error ? e.message : "版本列表加载失败",
          );
        }
      } finally {
        if (!cancelled) setVersionsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [view, projectId, userId, isGuest, refreshKey, versionRefresh]);

  const openVersionBrowse = async (version: number) => {
    if (!projectId || !userId.trim()) return;
    setBrowsingOverviewVersion(null);
    setBrowsingVersion(version);
    setVersionDetailLoading(true);
    setVersionsError(null);
    try {
      const data = await fetchKnowledgeChapterVersion(
        projectId,
        version,
        userId,
      );
      setVersionChapters(data.chapters);
      const firstWithHtml =
        flatSections.find((s) =>
          data.chapters.some(
            (c) => c.sectionId === s.id && c.html?.trim(),
          ),
        )?.id ?? flatSections[0]!.id;
      setVersionSectionId(firstWithHtml);
    } catch (e) {
      setVersionsError(e instanceof Error ? e.message : "版本内容加载失败");
      setBrowsingVersion(null);
      setVersionChapters([]);
    } finally {
      setVersionDetailLoading(false);
    }
  };

  const openOverviewBrowse = async (version: number) => {
    if (!projectId || !userId.trim()) return;
    setBrowsingVersion(null);
    setVersionChapters([]);
    setBrowsingOverviewVersion(version);
    setVersionDetailLoading(true);
    setVersionsError(null);
    try {
      const data = await fetchOverviewVersion(projectId, version, userId);
      setOverviewBrowseHtml(data.html);
      setOverviewBrowseKnVersion(data.knVersion);
      setOverviewBrowseGraph(parseProjectGraphHtml(data.graphHtml));
    } catch (e) {
      setVersionsError(e instanceof Error ? e.message : "概览版本加载失败");
      setBrowsingOverviewVersion(null);
      setOverviewBrowseHtml(null);
      setOverviewBrowseGraph(null);
    } finally {
      setVersionDetailLoading(false);
    }
  };

  const browsingHtml =
    versionChapters.find((c) => c.sectionId === versionSectionId)?.html ??
    null;

  const activeGroup = useMemo(
    () => CHAPTER_GROUPS.find((g) => g.id === groupId) ?? CHAPTER_GROUPS[0]!,
    [groupId],
  );

  const sectionLabel = useMemo(() => {
    for (const g of CHAPTER_GROUPS) {
      const s = g.sections.find((x) => x.id === sectionId);
      if (s) return s.label;
    }
    return sectionId;
  }, [sectionId]);

  const canUpdate = useMemo(() => {
    if (isGuest || !userId.trim()) return false;
    const p = project as Pick<WorkspaceProject, "id" | "createdBy"> | undefined;
    if (!p?.id) return false;
    return canUpdateProjectKnowledgeNetwork(userId, p);
  }, [isGuest, project, userId]);

  const canPublish = useMemo(() => {
    if (isGuest || !userId.trim()) return false;
    const p = project as Pick<WorkspaceProject, "id" | "createdBy"> | undefined;
    if (!p?.id) return false;
    return canPublishProjectKnowledgeNetwork(userId, p);
  }, [isGuest, project, userId]);

  const onRollbackVersion = async (version: number) => {
    if (!canPublish || rollbackBusy != null) return;
    if (version === currentBundleVersion) return;
    if (
      !window.confirm(
        `回滚到 ${formatChapterVersionLabel(version)}？`,
      )
    ) {
      return;
    }
    setRollbackBusy(version);
    setVersionsError(null);
    try {
      await rollbackKnowledgeChapterVersion(projectId, version, userId);
      setBrowsingVersion(null);
      setVersionChapters([]);
      setVersionRefresh((n) => n + 1);
    } catch (e) {
      setVersionsError(e instanceof Error ? e.message : "回滚失败");
    } finally {
      setRollbackBusy(null);
    }
  };

  const hasHtml = Boolean(html?.trim());
  const canRetryFailed = failedChapterIds.includes(sectionId);
  const canUpdateChapter = hasHtml || canRetryFailed;
  const sectionBusy =
    busyBySection[sectionId] ??
    (updatingChapterIds.includes(sectionId) ? "generate" : null);

  useEffect(() => {
    setLiveEditing(false);
  }, [sectionId]);

  useEffect(() => {
    if (!liveEditing || !chapterPaneRef.current || !html) return;
    chapterPaneRef.current.innerHTML = html;
  }, [liveEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  const startLiveEdit = () => {
    if (!canUpdate || !hasHtml || sectionBusy) return;
    setLiveEditing(true);
    setError(null);
  };

  const cancelLiveEdit = () => {
    setLiveEditing(false);
  };

  const saveLiveEdit = async () => {
    if (!canUpdate || !chapterPaneRef.current) return;
    const next = chapterPaneRef.current.innerHTML ?? "";
    if (!next.trim()) {
      setError("内容不能为空");
      return;
    }
    setLiveEditBusy(true);
    setError(null);
    try {
      const created = await createChapterDraftRun(projectId, userId, {
        scope: "section",
        sectionId,
        mode: "manual",
        html: next,
      });
      setLiveEditing(false);
      navigate(
        `/app/projects/${projectId}/knowledge/review/${created.run.id}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存草案失败");
    } finally {
      setLiveEditBusy(false);
    }
  };

  const relatedQuestions = useMemo(() => {
    if (sectionId === "questions") return [];
    const items = parseOpenQuestionsFromHtml(questionsHtml ?? "");
    return pickRelatedOpenQuestions(sectionId, items, 2);
  }, [questionsHtml, sectionId]);

  const onChapterGenerateSucceededRef = useRef(onChapterGenerateSucceeded);
  onChapterGenerateSucceededRef.current = onChapterGenerateSucceeded;
  const onChapterGenerateFailedRef = useRef(onChapterGenerateFailed);
  onChapterGenerateFailedRef.current = onChapterGenerateFailed;
  const failedChapterIdsRef = useRef(failedChapterIds);
  failedChapterIdsRef.current = failedChapterIds;

  const loadChapter = useCallback(
    async (sid: string) => {
      if (!projectId || !userId.trim() || isGuest) {
        if (sectionIdRef.current === sid) setHtml(null);
        return;
      }
      if (sectionIdRef.current === sid) {
        setLoadingChapter(true);
        setError(null);
      }
      try {
        const data = await fetchProjectKnowledgeChapter(projectId, sid, userId);
        if (sectionIdRef.current !== sid) return;
        const nextHtml = data.html?.trim() ? data.html : null;
        setHtml(nextHtml);
        // 仅在失败列表中有该章时清理，避免父组件 setState 触发 loadChapter 重建死循环
        if (nextHtml && failedChapterIdsRef.current.includes(sid)) {
          onChapterGenerateSucceededRef.current?.(sid);
        }
      } catch (e) {
        if (sectionIdRef.current !== sid) return;
        setHtml(null);
        setError(e instanceof Error ? e.message : "加载章节失败");
      } finally {
        if (sectionIdRef.current === sid) setLoadingChapter(false);
      }
    },
    [isGuest, projectId, userId],
  );

  const loadSources = useCallback(async () => {
    if (!projectId || !userId.trim() || isGuest) {
      setSourcesHtml(null);
      return;
    }
    setLoadingSources(true);
    setError(null);
    try {
      const data = await fetchProjectKnowledgeChapter(
        projectId,
        "sources",
        userId,
      );
      setSourcesHtml(data.html?.trim() ? data.html : null);
    } catch (e) {
      setSourcesHtml(null);
      setError(e instanceof Error ? e.message : "加载引用来源失败");
    } finally {
      setLoadingSources(false);
    }
  }, [isGuest, projectId, userId]);

  const loadGlossary = useCallback(async () => {
    if (!projectId || !userId.trim() || isGuest) {
      setGlossaryHtml(null);
      return;
    }
    setLoadingGlossary(true);
    setError(null);
    try {
      const data = await fetchProjectKnowledgeChapter(
        projectId,
        "glossary",
        userId,
      );
      setGlossaryHtml(data.html?.trim() ? data.html : null);
    } catch (e) {
      setGlossaryHtml(null);
      setError(e instanceof Error ? e.message : "加载名词解释失败");
    } finally {
      setLoadingGlossary(false);
    }
  }, [isGuest, projectId, userId]);

  const scrollToPendingCite = useCallback(() => {
    const citeId = pendingCiteIdRef.current;
    if (!citeId) return;
    pendingCiteIdRef.current = null;
    const anchorId = `kn-source-${citeId}`;
    requestAnimationFrame(() => {
      const root = sourcesPaneRef.current;
      const el =
        root?.querySelector(`#${CSS.escape(anchorId)}`) ??
        document.getElementById(anchorId);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("kn-source-flash");
        window.setTimeout(() => el.classList.remove("kn-source-flash"), 1600);
      }
    });
  }, []);

  useEffect(() => {
    if (view !== "chapters") return;
    void loadChapter(sectionId);
  }, [view, sectionId, loadChapter]);

  useEffect(() => {
    if (!refreshKey) return;
    void loadChapter(sectionId);
  }, [refreshKey, loadChapter, sectionId]);

  useEffect(() => {
    if (!projectId || !userId.trim() || isGuest) {
      setQuestionsHtml(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchProjectKnowledgeChapter(
          projectId,
          "questions",
          userId,
        );
        if (cancelled) return;
        setQuestionsHtml(data.html?.trim() ? data.html : null);
      } catch {
        if (!cancelled) setQuestionsHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, userId, isGuest, refreshKey]);

  useEffect(() => {
    if (view !== "sources") return;
    void loadSources();
  }, [view, loadSources]);

  useEffect(() => {
    if (view !== "sources" || loadingSources || !sourcesHtml) return;
    scrollToPendingCite();
  }, [view, loadingSources, sourcesHtml, scrollToPendingCite]);

  useEffect(() => {
    if (view !== "glossary") return;
    void loadGlossary();
  }, [view, loadGlossary]);

  const onChapterHtmlClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a.kn-cite") as HTMLAnchorElement | null;
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    const citeId =
      link.getAttribute("data-kn-cite")?.trim() ||
      /#kn-source-([A-Za-z]+-\d+)/u.exec(link.getAttribute("href") ?? "")?.[1] ||
      null;
    if (!citeId) return;
    pendingCiteIdRef.current = citeId;
    setView("sources");
  };

  const selectGroup = (id: string) => {
    const group = CHAPTER_GROUPS.find((g) => g.id === id);
    if (!group) return;
    setGroupId(group.id);
    setSectionId(group.sections[0]!.id);
  };

  const onGenerate = async () => {
    const targetSectionId = sectionId;
    const targetLabel = sectionLabel;
    if (
      !canUpdate ||
      busyBySection[targetSectionId] ||
      updatingChapterIds.includes(targetSectionId) ||
      !canUpdateChapter ||
      draftDialogOpen
    ) {
      return;
    }

    const startedAt = Date.now();
    setBusyBySection((m) => ({ ...m, [targetSectionId]: "generate" }));
    setError(null);
    setDraftDialogError(null);
    setDraftDialogReused(false);
    setDraftRunId(null);
    setDraftSectionLabel(targetLabel);
    setDraftDialogOpen(true);
    setDraftProgress({
      done: 0,
      total: 1,
      failed: 0,
      elapsedMs: 0,
      phase: "creating",
      lastLabel: targetLabel,
    });

    const tick = window.setInterval(() => {
      setDraftProgress((prev) =>
        prev ? { ...prev, elapsedMs: Date.now() - startedAt } : prev,
      );
    }, 1000);

    try {
      const created = await createChapterDraftRun(projectId, userId, {
        scope: "section",
        sectionId: targetSectionId,
      });
      const runId = created.run.id;
      setDraftRunId(runId);

      if (created.reused && created.run.status === "ready") {
        const item = created.items.find((i) => i.sectionId === targetSectionId);
        const ok = item?.status === "ok" || item?.hasHtml;
        setDraftDialogReused(Boolean(ok));
        setDraftProgress({
          done: 1,
          total: 1,
          failed: ok ? 0 : 1,
          elapsedMs: Date.now() - startedAt,
          phase: "done",
          lastLabel: targetLabel,
        });
        if (!ok) {
          setDraftDialogError("已有该章草案但生成失败，请放弃后重试，或直接进入审核查看。");
        }
        return;
      }

      const item = created.items.find((i) => i.sectionId === targetSectionId);
      const needGenerate =
        !created.reused ||
        !item ||
        item.status === "pending" ||
        item.status === "failed";

      setDraftProgress({
        done: needGenerate ? 0 : 1,
        total: 1,
        failed: 0,
        elapsedMs: Date.now() - startedAt,
        phase: needGenerate ? "generating" : "done",
        lastLabel: targetLabel,
      });

      if (needGenerate) {
        try {
          const snap = await waitForDraftRunSettled(projectId, runId, userId, {
            sectionIds: [targetSectionId],
            onProgress: (summary) => {
              setDraftProgress({
                done: summary.done,
                total: 1,
                failed: summary.failed,
                elapsedMs: Date.now() - startedAt,
                phase: summary.settled ? "done" : "generating",
                lastLabel: targetLabel,
                failedDetails: summary.failedDetails,
              });
            },
          });
          const latest = snap.items.find((i) => i.sectionId === targetSectionId);
          const ok = latest?.status === "ok";
          setDraftProgress({
            done: 1,
            total: 1,
            failed: ok ? 0 : 1,
            elapsedMs: Date.now() - startedAt,
            phase: "done",
            lastLabel: targetLabel,
            failedDetails:
              !ok && latest?.error
                ? [`${targetLabel}：${latest.error}`]
                : undefined,
          });
          if (!ok) {
            setDraftDialogError(latest?.error?.trim() || "生成草案失败");
            onChapterGenerateFailedRef.current?.(targetSectionId);
          } else {
            onChapterGenerateSucceededRef.current?.(targetSectionId);
          }
        } catch (e) {
          if (e instanceof DraftRunDiscardedError) throw e;
          const msg = e instanceof Error ? e.message : "生成草案失败";
          setDraftProgress({
            done: 1,
            total: 1,
            failed: 1,
            elapsedMs: Date.now() - startedAt,
            phase: "done",
            lastLabel: targetLabel,
          });
          setDraftDialogError(msg);
          onChapterGenerateFailedRef.current?.(targetSectionId);
        }
      }
    } catch (e) {
      if (e instanceof DraftRunDiscardedError) {
        setDraftDialogOpen(false);
        setDraftProgress(null);
        setDraftDialogError(null);
        setDraftRunId(null);
      } else if (e instanceof ActiveDraftExistsError) {
        setDraftRunId(e.activeRunId);
        setDraftDialogOpen(false);
        setError(
          `${e.message} 请点击顶栏提示中的「继续审核草案」，或前往系统管理 → 审核。`,
        );
        setDraftProgress(null);
      } else {
        const msg = e instanceof Error ? e.message : "创建更新草案失败";
        setDraftDialogError(msg);
        setError(msg);
        setDraftProgress((prev) =>
          prev
            ? { ...prev, phase: "done", elapsedMs: Date.now() - startedAt }
            : prev,
        );
      }
    } finally {
      window.clearInterval(tick);
      setBusyBySection((m) => {
        const next = { ...m };
        delete next[targetSectionId];
        return next;
      });
    }
  };

  const goDraftReview = () => {
    if (!draftRunId) return;
    setDraftDialogOpen(false);
    navigate(`/app/projects/${projectId}/knowledge/review/${draftRunId}`);
  };

  const onStopDraft = async () => {
    if (!draftRunId || draftStopping) return;
    setDraftStopping(true);
    setDraftDialogError(null);
    try {
      await discardChapterDraftRun(projectId, draftRunId, userId);
      setDraftDialogOpen(false);
      setDraftProgress(null);
      setDraftRunId(null);
    } catch (e) {
      setDraftDialogError(e instanceof Error ? e.message : "停止生成失败");
    } finally {
      setDraftStopping(false);
    }
  };

  const onRevise = async () => {
    const targetSectionId = sectionId;
    if (
      !canPublish ||
      busyBySection[targetSectionId] ||
      updatingChapterIds.includes(targetSectionId) ||
      !hasHtml
    ) {
      return;
    }
    const text = instruction.trim();
    if (!text) return;
    setBusyBySection((m) => ({ ...m, [targetSectionId]: "revise" }));
    setError(null);
    try {
      const data = await reviseProjectKnowledgeChapter(
        projectId,
        targetSectionId,
        userId,
        text,
      );
      if (sectionIdRef.current === targetSectionId) {
        setHtml(data.html?.trim() ? data.html : null);
        setInstruction("");
      }
    } catch (e) {
      if (sectionIdRef.current === targetSectionId) {
        setError(e instanceof Error ? e.message : "改写失败");
      }
    } finally {
      setBusyBySection((m) => {
        const next = { ...m };
        delete next[targetSectionId];
        return next;
      });
    }
  };

  const focusChat = () => {
    chatRef.current?.focus();
  };

  const goToQuestions = () => {
    setView("chapters");
    setGroupId("risk");
    setSectionId("questions");
  };

  const openAllChaptersConfirm = async () => {
    setAllChaptersConfirm(true);
    setConfirmLoading(true);
    setConfirmHasDraft(false);
    setConfirmPublished(0);
    setConfirmFailed(0);
    try {
      const [active, live] = await Promise.all([
        fetchActiveChapterDraftRun(projectId, userId).catch(() => null),
        listProjectKnowledgeChapters(projectId, userId).catch(() => null),
      ]);
      const researchIds = new Set(RESEARCH_SECTION_IDS);
      const published = live?.chapters
        ? live.chapters.filter((c) => researchIds.has(c.sectionId) && c.hasHtml)
            .length
        : 0;
      setConfirmHasDraft(Boolean(active?.runId));
      setConfirmPublished(published);
      setConfirmFailed(Number(active?.failedCount ?? 0));
      if (active?.runId) setDraftRunId(active.runId);
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <section className="mt-1" aria-labelledby="project-knowledge-heading">
      <h3 id="project-knowledge-heading" className="sr-only">
        知识网络
      </h3>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3.5">
        <div className="inline-flex items-center gap-0.5 rounded-[10px] bg-[rgba(78,66,57,0.07)] p-0.5">
          {VIEW_TABS.map((t) => {
            const active = view === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setView(t.id)}
                className={cn(
                  "h-8 whitespace-nowrap rounded-lg px-3.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-[#1F2423] text-white"
                    : "bg-transparent text-[#59625F] hover:text-[#1F2423]",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {canUpdateAllChapters || canUpdate ? (
          <button
            type="button"
            onClick={() => void openAllChaptersConfirm()}
            disabled={
              !canUpdateAllChapters ||
              allChaptersBusy ||
              overviewBusy ||
              !onUpdateAllChapters
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[hsl(var(--wine)/0.35)] bg-[hsl(var(--wine-muted))] px-3.5 text-[13px] font-medium text-[hsl(var(--wine))] transition-colors hover:bg-[#EFE7E6] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", allChaptersBusy && "animate-spin")}
              strokeWidth={2}
            />
            {allChaptersBusy ? "生成草案中…" : "更新全部章节"}
          </button>
        ) : null}
      </div>

      {view === "chapters" ? (
        <div className="space-y-3">
          {canPublish ? (
          <div className="flex items-end gap-2.5 rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.9)] p-3">
            <textarea
              ref={chatRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={2}
              disabled={
                !hasHtml || !canPublish || sectionBusy !== null || liveEditing
              }
              placeholder={
                hasHtml
                  ? "输入对本节内容的改写指令，例如：把研究结论写得更简洁"
                  : "请先「更新全部章节」生成后再改写"
              }
              className="min-h-[52px] flex-1 resize-y rounded-xl border border-[rgba(78,66,57,0.12)] bg-white/80 px-3.5 py-2.5 text-[13px] leading-relaxed text-[#1F2423] outline-none placeholder:text-[#969E9A] focus:border-[rgba(160,99,88,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void onRevise()}
              disabled={
                !hasHtml ||
                !canPublish ||
                sectionBusy !== null ||
                liveEditing ||
                !instruction.trim()
              }
              className="h-10 shrink-0 rounded-[9px] bg-[#A06358] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#8F564C] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sectionBusy === "revise" ? "改写中…" : "发送"}
            </button>
          </div>
          ) : canUpdate ? (
            <p className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.9)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#59625F]">
              更新本章会生成草案。改完后在审核页提交给项目管理员审批，不会直接改正式版。
            </p>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-[rgba(160,99,88,0.25)] bg-[rgba(160,99,88,0.06)] px-3.5 py-2 text-[12.5px] text-[#A06358]">
              {error}
            </p>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.74)]">
            <div className="flex items-center gap-1 overflow-x-auto border-b border-[rgba(78,66,57,0.1)] px-3.5 py-2.5">
              {CHAPTER_GROUPS.map((g) => {
                const active = g.id === activeGroup.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => selectGroup(g.id)}
                    className={cn(
                      "h-[34px] whitespace-nowrap rounded-lg px-3.5 text-[12.5px] transition-colors",
                      active
                        ? "bg-[#EFE7E6] font-semibold text-[#A06358]"
                        : "bg-transparent font-normal text-[#59625F] hover:bg-[rgba(160,99,88,0.04)]",
                    )}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-0.5 overflow-x-auto border-b border-[rgba(78,66,57,0.08)] px-[18px]">
              {activeGroup.sections.map((s) => {
                const active = s.id === sectionId;
                const sidBusy =
                  busyBySection[s.id] ??
                  (updatingChapterIds.includes(s.id) ? "generate" : null);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSectionId(s.id)}
                    className={cn(
                      "h-[42px] whitespace-nowrap border-b-2 px-3.5 text-[13px] transition-colors",
                      active
                        ? "border-[#A06358] font-semibold text-[#A06358]"
                        : "border-transparent font-normal text-[#59625F] hover:text-[#1F2423]",
                    )}
                  >
                    {s.label}
                    {sidBusy ? (
                      <span className="ml-1 text-[11px] font-normal text-[#969E9A]">
                        ·更新中
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="grid min-h-[470px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_304px]">
              <article className="border-[rgba(78,66,57,0.08)] px-[34px] py-[34px] lg:border-r">
                {sectionBusy === "generate" || sectionBusy === "revise" ? (
                  <div className="flex min-h-[280px] items-center justify-center">
                    <p className="text-[13px] text-[#969E9A]">
                      {sectionBusy === "generate"
                        ? "正在生成本章内容…"
                        : "正在按指令改写…"}
                    </p>
                  </div>
                ) : loadingChapter ? (
                  <div className="flex min-h-[280px] items-center justify-center">
                    <p className="text-[13px] text-[#969E9A]">加载中…</p>
                  </div>
                ) : hasHtml ? (
                  <div
                    ref={chapterPaneRef}
                    role="presentation"
                    onClick={liveEditing ? undefined : onChapterHtmlClick}
                    contentEditable={liveEditing}
                    suppressContentEditableWarning
                    className={cn(
                      "kn-chapter-html text-[13.5px] leading-[1.75] text-[#1F2423] [&_a.kn-cite]:cursor-pointer [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-[15px] [&_h3]:font-semibold [&_p]:my-2 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[rgba(78,66,57,0.12)] [&_td]:px-3 [&_td]:py-2 [&_th]:whitespace-nowrap [&_th]:border [&_th]:border-[rgba(78,66,57,0.12)] [&_th]:bg-[rgba(78,66,57,0.05)] [&_th]:px-3 [&_th]:py-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
                      sectionId === "snapshot" &&
                        "[&_tbody_td:first-child]:whitespace-nowrap [&_tbody_td:first-child]:font-medium",
                      liveEditing &&
                        "outline outline-2 outline-[rgba(160,99,88,0.25)] outline-offset-[-2px]",
                    )}
                    {...(liveEditing
                      ? {}
                      : {
                          dangerouslySetInnerHTML: {
                            __html: stripAuthoringHintsFromHtml(html!),
                          },
                        })}
                  />
                ) : (
                  <div className="flex min-h-[280px] items-center justify-center px-8 py-16">
                    <p className="text-center text-[13px] text-[#969E9A]">
                      {canRetryFailed
                        ? "本章上次生成失败，可点击右侧「更新本章」重试"
                        : "本章尚无内容，请先「更新全部章节」生成"}
                    </p>
                  </div>
                )}
              </article>

              <aside className="bg-[rgba(248,243,238,0.45)] px-[22px] py-6">
                <div className="lg:sticky lg:top-4">
                  <div className="mb-[18px] border-b border-[rgba(78,66,57,0.1)] pb-[18px]">
                    <button
                      type="button"
                      onClick={() => void onGenerate()}
                      disabled={
                        !canUpdateChapter ||
                        !canUpdate ||
                        sectionBusy !== null ||
                        liveEditing
                      }
                      title={
                        sectionBusy
                          ? "本章正在生成草案"
                          : !canUpdateChapter
                            ? "本章尚无内容，请先「更新全部章节」生成"
                            : "更新本章"
                      }
                      className="h-9 w-full whitespace-nowrap rounded-[9px] border border-[rgba(160,99,88,0.3)] bg-transparent px-2.5 text-[12px] font-medium text-[#A06358] transition-colors hover:bg-[#EFE7E6] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sectionBusy
                        ? "生成草案中…"
                        : canRetryFailed && !hasHtml
                          ? "重试本章"
                          : "更新本章"}
                    </button>
                    {canUpdate && hasHtml ? (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {!liveEditing ? (
                          <button
                            type="button"
                            disabled={sectionBusy !== null}
                            onClick={startLiveEdit}
                            className="h-9 w-full rounded-[9px] border border-[rgba(78,66,57,0.18)] text-[12px] font-medium text-[#1F2423] hover:bg-[rgba(78,66,57,0.04)] disabled:opacity-50"
                          >
                            编辑本章
                          </button>
                        ) : (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={liveEditBusy}
                              onClick={cancelLiveEdit}
                              className="h-9 flex-1 rounded-[9px] border border-[rgba(78,66,57,0.18)] text-[12px] font-medium text-[#1F2423] disabled:opacity-50"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              disabled={liveEditBusy}
                              onClick={() => void saveLiveEdit()}
                              className="h-9 flex-1 rounded-[9px] bg-[#A06358] text-[12px] font-medium text-white hover:bg-[#8F564C] disabled:opacity-50"
                            >
                              {liveEditBusy
                                ? "保存中…"
                                : canPublish
                                  ? "保存，去发布"
                                  : "保存，去提交审批"}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-start justify-between gap-2.5">
                    <div className="text-[12.5px] font-semibold leading-snug text-[#1F2423]">
                      {sectionLabel}
                    </div>
                    <span
                      className={cn(
                        "whitespace-nowrap rounded-lg px-2 py-[3px] text-[10px]",
                        hasHtml
                          ? "bg-[rgba(94,155,117,0.15)] text-[#3F6F63]"
                          : "bg-[rgba(213,154,47,0.15)] text-[#B07d1f]",
                      )}
                    >
                      {hasHtml ? "已有内容" : "待补资料"}
                    </span>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-[#59625F]">
                      项目阶段
                    </span>
                    <span className="font-[family-name:var(--font-serif,serif)] text-[18px] font-semibold leading-snug text-[#1F2423]">
                      {project ? projectPhaseLabel(project.phase) : "—"}
                    </span>
                  </div>

                  {sectionId !== "questions" ? (
                    <>
                      <div className="my-4 h-px bg-[rgba(78,66,57,0.1)]" />
                      <div className="mb-2 text-[12px] text-[#59625F]">
                        关联待确认问题
                      </div>
                      {relatedQuestions.length === 0 ? (
                        <p className="text-[12px] leading-relaxed text-[#969E9A]">
                          暂无关联事项
                        </p>
                      ) : (
                        <div>
                          {relatedQuestions.map((q, i) => {
                            const { title } = extractOpenQuestionTitle(q.text);
                            return (
                              <button
                                key={`${q.priority}-${i}-${q.text.slice(0, 24)}`}
                                type="button"
                                onClick={goToQuestions}
                                className="flex w-full items-start gap-2.5 border-b border-[rgba(78,66,57,0.08)] bg-transparent py-2.5 text-left font-inherit last:border-b-0"
                              >
                                <span
                                  className={cn(
                                    "mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none",
                                    q.priority === "P1" &&
                                      "bg-[#EFE7E6] text-[#A06358]",
                                    q.priority === "P2" &&
                                      "bg-[rgba(213,154,47,0.15)] text-[#B07d1f]",
                                    q.priority === "P3" &&
                                      "bg-[rgba(78,66,57,0.08)] text-[#59625F]",
                                  )}
                                >
                                  {q.priority}
                                </span>
                                <span className="line-clamp-2 text-[13px] font-medium leading-snug text-[#1F2423]">
                                  {title || q.text}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={goToQuestions}
                        className="h-[34px] border-none bg-transparent p-0 text-[12px] font-medium text-[#A06358]"
                      >
                        查看全部待确认问题 →
                      </button>
                    </>
                  ) : null}

                  <button
                    type="button"
                    onClick={focusChat}
                    className="mt-4 h-9 w-full rounded-[9px] border border-[rgba(160,99,88,0.3)] bg-transparent text-[12px] font-medium text-[#A06358] transition-colors hover:bg-[#EFE7E6]"
                  >
                    围绕本章提问
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : view === "sources" ? (
        <div className="overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.76)]">
          <div className="border-b border-[rgba(78,66,57,0.1)] px-8 py-7">
            <div className="text-[11px] tracking-wide text-[#A06358]">
              知识网络资料
            </div>
            <div className="mt-2 font-[family-name:var(--font-serif,serif)] text-[27px] font-semibold text-[#1F2423]">
              引用来源
            </div>
            <p className="mt-2.5 max-w-[820px] text-[13px] leading-[1.75] text-[#59625F]">
              集中查看当前知识网络实际使用的项目文件、公开资料与分析来源。随任意章节「更新本章」增量补充，不整表重写。
            </p>
          </div>
          <div ref={sourcesPaneRef} className="px-8 py-[30px]">
            {error && view === "sources" ? (
              <p className="mb-4 rounded-xl border border-[rgba(160,99,88,0.25)] bg-[rgba(160,99,88,0.06)] px-3.5 py-2 text-[12.5px] text-[#A06358]">
                {error}
              </p>
            ) : null}
            {loadingSources ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <p className="text-[13px] text-[#969E9A]">加载中…</p>
              </div>
            ) : sourcesHtml?.trim() ? (
              <div
                className="kn-sources-html text-[13px] leading-[1.65] text-[#1F2423] [&_table]:w-full [&_table]:border-collapse [&_tbody_td:first-child]:whitespace-nowrap [&_tbody_td:first-child]:font-semibold [&_tbody_td:first-child]:text-[#A06358] [&_td]:border [&_td]:border-[rgba(78,66,57,0.12)] [&_td]:px-3.5 [&_td]:py-3 [&_th]:whitespace-nowrap [&_th]:border [&_th]:border-[rgba(78,66,57,0.12)] [&_th]:bg-[rgba(78,66,57,0.05)] [&_th]:px-3.5 [&_th]:py-3 [&_th]:text-left [&_th]:text-[12px] [&_th]:font-semibold [&_th]:text-[#59625F] [&_tr.kn-source-flash]:bg-[rgba(160,99,88,0.08)] [&_tr]:scroll-mt-24"
                dangerouslySetInnerHTML={{ __html: sourcesHtml }}
              />
            ) : (
              <div className="flex min-h-[200px] items-center justify-center px-8 py-12">
                <p className="text-center text-[13px] text-[#969E9A]">
                  尚无引用来源。更新任意研究章节时会自动增量写入。
                </p>
              </div>
            )}
          </div>
        </div>
      ) : view === "glossary" ? (
        <div className="overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.76)]">
          <div className="border-b border-[rgba(78,66,57,0.1)] px-8 py-7">
            <div className="text-[11px] tracking-wide text-[#A06358]">
              知识网络资料
            </div>
            <div className="mt-2 font-[family-name:var(--font-serif,serif)] text-[27px] font-semibold text-[#1F2423]">
              名词解释
            </div>
            <p className="mt-2.5 max-w-[820px] text-[13px] leading-[1.75] text-[#59625F]">
              解释知识网络正文中实际出现、可能影响研究判断的非常用术语（如多字母缩写）；常识词不会收录。随章节更新增量补充。
            </p>
          </div>
          <div className="px-8 py-[30px]">
            {error && view === "glossary" ? (
              <p className="mb-4 rounded-xl border border-[rgba(160,99,88,0.25)] bg-[rgba(160,99,88,0.06)] px-3.5 py-2 text-[12.5px] text-[#A06358]">
                {error}
              </p>
            ) : null}
            {loadingGlossary ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <p className="text-[13px] text-[#969E9A]">加载中…</p>
              </div>
            ) : glossaryHtml?.trim() ? (
              <div
                className="kn-glossary-html text-[13px] leading-[1.65] text-[#1F2423] [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[rgba(78,66,57,0.12)] [&_td]:px-3.5 [&_td]:py-3.5 [&_th]:whitespace-nowrap [&_th]:border [&_th]:border-[rgba(78,66,57,0.12)] [&_th]:bg-[rgba(78,66,57,0.05)] [&_th]:px-3.5 [&_th]:py-3 [&_th]:text-left [&_th]:text-[12px] [&_th]:font-semibold [&_th]:text-[#59625F]"
                dangerouslySetInnerHTML={{ __html: glossaryHtml }}
              />
            ) : (
              <div className="flex min-h-[200px] items-center justify-center px-8 py-12">
                <p className="text-center text-[13px] text-[#969E9A]">
                  尚无名词解释。更新任意研究章节时，会把本章出现的非常用术语增量写入。
                </p>
              </div>
            )}
          </div>
        </div>
      ) : browsingOverviewVersion != null ? (
        <div className="overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.76)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(78,66,57,0.1)] px-6 py-4">
            <div>
              <div className="text-[11px] tracking-wide text-[#A06358]">
                项目概览版本（只读）
              </div>
              <div className="mt-1 font-[family-name:var(--font-serif,serif)] text-[22px] font-semibold text-[#1F2423]">
                {formatOverviewVersionLabel(browsingOverviewVersion)}
                {browsingOverviewVersion === currentOverviewVersion ? (
                  <span className="ml-2 align-middle text-[12px] font-medium text-[#2F6B4F]">
                    当前概览
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[12.5px] text-[#59625F]">
                对应知识网络 {formatChapterVersionLabel(overviewBrowseKnVersion)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setBrowsingOverviewVersion(null);
                setOverviewBrowseHtml(null);
                setOverviewBrowseGraph(null);
              }}
              className="h-9 rounded-[9px] border border-[rgba(78,66,57,0.18)] px-3.5 text-[13px] font-medium text-[#1F2423] hover:bg-[rgba(78,66,57,0.04)]"
            >
              返回版本列表
            </button>
          </div>
          <div className="px-6 py-6">
            {versionDetailLoading ? (
              <p className="text-[13px] text-[#969E9A]">加载中…</p>
            ) : (
              <div className="space-y-4">
                {overviewBrowseHtml?.trim() ? (
                  <div
                    className="kn-project-overview-html text-[13px] leading-[1.65] text-[#1F2423] [&_#project-graph-slot]:hidden [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[rgba(78,66,57,0.12)] [&_td]:px-3.5 [&_td]:py-3.5 [&_th]:border [&_th]:border-[rgba(78,66,57,0.12)] [&_th]:bg-[rgba(78,66,57,0.05)] [&_th]:px-3.5 [&_th]:py-3"
                    dangerouslySetInnerHTML={{ __html: overviewBrowseHtml }}
                  />
                ) : (
                  <p className="text-[13px] text-[#969E9A]">该概览版本无内容</p>
                )}
                {overviewBrowseGraph ? (
                  <ProjectRelationGraph
                    data={overviewBrowseGraph}
                    projectId={projectId}
                  />
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : browsingVersion != null ? (
        <div className="overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.76)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(78,66,57,0.1)] px-6 py-4">
            <div>
              <div className="text-[11px] tracking-wide text-[#A06358]">
                版本浏览（只读）
              </div>
              <div className="mt-1 font-[family-name:var(--font-serif,serif)] text-[22px] font-semibold text-[#1F2423]">
                {formatChapterVersionLabel(browsingVersion)}
                {browsingVersion === currentBundleVersion ? (
                  <span className="ml-2 align-middle text-[12px] font-medium text-[#2F6B4F]">
                    当前版本
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canPublish &&
              browsingVersion !== currentBundleVersion ? (
                <button
                  type="button"
                  disabled={rollbackBusy != null}
                  onClick={() => void onRollbackVersion(browsingVersion)}
                  className="h-9 rounded-[9px] border border-[rgba(160,99,88,0.3)] px-3.5 text-[13px] font-medium text-[#A06358] hover:bg-[#EFE7E6] disabled:opacity-50"
                >
                  {rollbackBusy === browsingVersion ? "回滚中…" : "回滚到此版本"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setBrowsingVersion(null);
                  setVersionChapters([]);
                }}
                className="h-9 rounded-[9px] border border-[rgba(78,66,57,0.18)] px-3.5 text-[13px] font-medium text-[#1F2423] hover:bg-[rgba(78,66,57,0.04)]"
              >
                返回版本列表
              </button>
            </div>
          </div>
          {versionsError ? (
            <p className="mx-6 mt-4 rounded-xl border border-[rgba(160,99,88,0.25)] bg-[rgba(160,99,88,0.06)] px-3.5 py-2 text-[12.5px] text-[#A06358]">
              {versionsError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5 border-b border-[rgba(78,66,57,0.08)] px-4 py-3">
            {flatSections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setVersionSectionId(s.id)}
                className={cn(
                  "h-8 rounded-lg px-3 text-[12.5px]",
                  versionSectionId === s.id
                    ? "bg-[#EFE7E6] font-semibold text-[#A06358]"
                    : "text-[#59625F] hover:bg-[rgba(78,66,57,0.05)]",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="px-6 py-6">
            {versionDetailLoading ? (
              <p className="text-[13px] text-[#969E9A]">加载中…</p>
            ) : browsingHtml?.trim() ? (
              <div
                className="kn-chapter-html text-[13px] leading-[1.65] text-[#1F2423] [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[rgba(78,66,57,0.12)] [&_td]:px-3.5 [&_td]:py-3.5 [&_th]:border [&_th]:border-[rgba(78,66,57,0.12)] [&_th]:bg-[rgba(78,66,57,0.05)] [&_th]:px-3.5 [&_th]:py-3 [&_th]:text-left [&_th]:text-[12px]"
                dangerouslySetInnerHTML={{ __html: browsingHtml }}
              />
            ) : (
              <p className="text-[13px] text-[#969E9A]">该版本没有此章节</p>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.76)]">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[rgba(78,66,57,0.1)] px-6 py-5 md:px-8">
            <div>
              <div className="text-[11px] tracking-wide text-[#A06358]">
                知识网络
              </div>
              <div className="mt-1.5 font-[family-name:var(--font-serif,serif)] text-[24px] font-semibold text-[#1F2423]">
                版本记录
              </div>
            </div>
            <p className="text-[12.5px] text-[#59625F]">
              知识网络 {formatChapterVersionLabel(currentBundleVersion)}
              {currentOverviewVersion > 0
                ? ` · 项目概览 ${formatOverviewVersionLabel(currentOverviewVersion)}`
                : ""}
            </p>
          </div>
          <div className="px-4 py-4 md:px-6">
            {versionsError ? (
              <p className="mb-4 rounded-xl border border-[rgba(160,99,88,0.25)] bg-[rgba(160,99,88,0.06)] px-3.5 py-2 text-[12.5px] text-[#A06358]">
                {versionsError}
              </p>
            ) : null}
            {versionsLoading ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <p className="text-[13px] text-[#969E9A]">加载中…</p>
              </div>
            ) : versionMetas.length === 0 && overviewVersionMetas.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center px-8 py-12">
                <p className="text-center text-[13px] text-[#969E9A]">
                  还没有版本记录
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-[rgba(78,66,57,0.08)]">
                <section className="min-w-0 px-2 pb-6 lg:pr-6 lg:pb-2">
                  <h3 className="px-1 text-[13px] font-semibold text-[#1F2423]">
                    知识网络
                  </h3>
                  {versionMetas.length === 0 ? (
                    <p className="mt-4 px-1 text-[12.5px] text-[#969E9A]">
                      暂无记录
                    </p>
                  ) : (
                    <ul className="mt-2 divide-y divide-[rgba(78,66,57,0.08)]">
                      {versionMetas.map((v) => {
                        const isCurrent =
                          v.isCurrent || v.version === currentBundleVersion;
                        return (
                          <li key={v.version} className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[15px] font-semibold text-[#1F2423]">
                                    {formatChapterVersionLabel(v.version)}
                                  </span>
                                  {isCurrent ? (
                                    <span className="rounded-md bg-[rgba(47,107,79,0.12)] px-1.5 py-0.5 text-[11px] font-medium text-[#2F6B4F]">
                                      当前
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 truncate text-[12px] text-[#969E9A]">
                                  {formatVersionTime(v.archivedAt)}
                                  {v.archivedBy ? ` · ${v.archivedBy}` : ""}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void openVersionBrowse(v.version)}
                                  className="h-8 rounded-lg px-2.5 text-[12px] font-medium text-[#A06358] hover:bg-[#EFE7E6]"
                                >
                                  查看
                                </button>
                                {canPublish && !isCurrent ? (
                                  <button
                                    type="button"
                                    disabled={rollbackBusy != null}
                                    onClick={() => void onRollbackVersion(v.version)}
                                    className="h-8 rounded-lg border border-[rgba(160,99,88,0.3)] px-2.5 text-[12px] font-medium text-[#A06358] hover:bg-[#EFE7E6] disabled:opacity-50"
                                  >
                                    {rollbackBusy === v.version
                                      ? "回滚中…"
                                      : "回滚"}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
                <section className="min-w-0 border-t border-[rgba(78,66,57,0.08)] px-2 pt-6 lg:border-t-0 lg:pl-6 lg:pt-0">
                  <h3 className="px-1 text-[13px] font-semibold text-[#1F2423]">
                    项目概览
                  </h3>
                  {overviewVersionMetas.length === 0 ? (
                    <p className="mt-4 px-1 text-[12.5px] text-[#969E9A]">
                      暂无记录
                    </p>
                  ) : (
                    <ul className="mt-2 divide-y divide-[rgba(78,66,57,0.08)]">
                      {overviewVersionMetas.map((v) => {
                        const isCurrent =
                          v.isCurrent || v.version === currentOverviewVersion;
                        return (
                          <li key={`ov-${v.version}`} className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[15px] font-semibold text-[#1F2423]">
                                    {formatOverviewVersionLabel(v.version)}
                                  </span>
                                  {isCurrent ? (
                                    <span className="rounded-md bg-[rgba(47,107,79,0.12)] px-1.5 py-0.5 text-[11px] font-medium text-[#2F6B4F]">
                                      当前
                                    </span>
                                  ) : null}
                                  {v.knVersion > 0 ? (
                                    <span className="text-[11px] text-[#969E9A]">
                                      {formatChapterVersionLabel(v.knVersion)}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 truncate text-[12px] text-[#969E9A]">
                                  {formatVersionTime(v.archivedAt)}
                                  {v.archivedBy ? ` · ${v.archivedBy}` : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void openOverviewBrowse(v.version)}
                                className="h-8 shrink-0 rounded-lg px-2.5 text-[12px] font-medium text-[#A06358] hover:bg-[#EFE7E6]"
                              >
                                查看
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}

      <KnowledgeDraftGeneratingDialog
        open={draftDialogOpen}
        progress={draftProgress}
        runId={draftRunId}
        error={draftDialogError}
        mode="section"
        sectionLabel={draftSectionLabel}
        reused={draftDialogReused}
        onClose={() => setDraftDialogOpen(false)}
        onGoReview={goDraftReview}
        stopping={draftStopping}
        onStop={() => void onStopDraft()}
      />

      {allChaptersConfirm && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
              role="dialog"
              aria-modal
              aria-labelledby="all-chapters-confirm-title"
              onPointerDown={markBackdropPointerDown}
              onClick={(e) =>
                dismissIfBackdropClick(e, () => setAllChaptersConfirm(false))
              }
            >
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-[rgba(78,66,57,0.12)] bg-white shadow-2xl">
                <div className="border-b border-[rgba(78,66,57,0.1)] px-5 py-4">
                  <h3
                    id="all-chapters-confirm-title"
                    className="font-display text-lg font-semibold text-[#1F2423]"
                  >
                    确认更新全部章节
                  </h3>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-[#59625F]">
                    {allChaptersConfirmText({
                      loading: confirmLoading,
                      hasDraft: confirmHasDraft,
                      published: confirmPublished,
                      failed: confirmFailed,
                      total: RESEARCH_CHAPTER_COUNT,
                    })}
                  </p>
                </div>
                <div className="flex flex-col-reverse gap-2 px-5 py-3 sm:flex-row sm:flex-wrap sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setAllChaptersConfirm(false)}
                    className="rounded-full border border-[rgba(78,66,57,0.14)] px-4 py-2 text-xs font-semibold text-[#1F2423] hover:bg-[rgba(78,66,57,0.05)]"
                  >
                    取消
                  </button>
                  {confirmLoading ? (
                    <button
                      type="button"
                      disabled
                      className="rounded-full bg-[hsl(var(--wine))] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      请稍候…
                    </button>
                  ) : confirmHasDraft &&
                    confirmPublished > 0 &&
                    RESEARCH_CHAPTER_COUNT - confirmPublished > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setAllChaptersConfirm(false);
                          onUpdateAllChapters?.("all-drafts");
                        }}
                        className="rounded-full border border-[rgba(78,66,57,0.14)] px-4 py-2 text-xs font-semibold text-[#1F2423] hover:bg-[rgba(78,66,57,0.05)]"
                      >
                        全部重来
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAllChaptersConfirm(false);
                          onUpdateAllChapters?.("unpublished");
                        }}
                        className="rounded-full bg-[hsl(var(--wine))] px-4 py-2 text-xs font-semibold text-white hover:bg-[hsl(var(--wine-hover))]"
                      >
                        {`更新未发布 ${RESEARCH_CHAPTER_COUNT - confirmPublished} 章`}
                      </button>
                    </>
                  ) : confirmHasDraft && confirmFailed > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAllChaptersConfirm(false);
                        onUpdateAllChapters?.();
                      }}
                      className="rounded-full bg-[hsl(var(--wine))] px-4 py-2 text-xs font-semibold text-white hover:bg-[hsl(var(--wine-hover))]"
                    >
                      重试失败
                    </button>
                  ) : confirmHasDraft ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAllChaptersConfirm(false);
                        goDraftReview();
                      }}
                      className="rounded-full bg-[hsl(var(--wine))] px-4 py-2 text-xs font-semibold text-white hover:bg-[hsl(var(--wine-hover))]"
                    >
                      前往审核
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAllChaptersConfirm(false);
                        onUpdateAllChapters?.();
                      }}
                      className="rounded-full bg-[hsl(var(--wine))] px-4 py-2 text-xs font-semibold text-white hover:bg-[hsl(var(--wine-hover))]"
                    >
                      开始更新全部章节
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
