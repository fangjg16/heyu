import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Trash2,
} from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  ProjectRelationGraph,
  parseProjectGraphHtml,
} from "@/components/workspace/ProjectRelationGraph";
import { cn } from "@/lib/utils";
import { stripAuthoringHintsFromHtml } from "@/lib/strip-authoring-hints";
import {
  deleteChapterDraftSection,
  discardChapterDraftRun,
  fetchChapterDraftRun,
  fetchProjectKnowledgeChapter,
  generateChapterDraftSection,
  listProjectKnowledgeChapters,
  publishChapterDraftRun,
  reviseChapterDraftSection,
  saveChapterDraftSection,
  submitChapterDraftRun,
  type ChapterDraftItem,
} from "@/lib/project-api";
import {
  bumpChapterVersion,
  formatChapterVersionLabel,
  formatOverviewVersionLabel,
  isOverviewOnlyPublish,
  isPreReleaseChapterVersion,
  nextChapterVersion,
  researchChaptersCompleteFromFlags,
  type ChapterVersionBump,
} from "@/lib/chapter-version";
import {
  diffLines,
  normalizeHtmlForCompare,
  stripHtmlToText,
} from "@/lib/text-line-diff";
import { loadSessionUserId } from "@/workspace/session";
import {
  canPublishProjectKnowledgeNetwork,
  canUpdateProjectKnowledgeNetwork,
} from "@/workspace/project-manage";
import { resolveAnalysisKind } from "@/lib/analysis-kind";
import { researchSectionsForKind } from "@/lib/kn-catalog";
import { getMergedProjects } from "@/workspace/project-registry";

const OVERVIEW_CHAPTER = { id: "project-overview", label: "项目概览" };

function reviewableChapters(kind: ReturnType<typeof resolveAnalysisKind>) {
  return [OVERVIEW_CHAPTER, ...researchSectionsForKind(kind)];
}

type ChangeKind = "added" | "changed" | "unchanged" | "failed" | "pending" | "revising";

type ReviewRow = {
  id: string;
  label: string;
  kind: ChangeKind;
  draftHtml: string | null;
  liveHtml: string | null;
  error: string | null;
  reviseNote: string | null;
};

type ConfirmMode =
  | { type: "one"; sectionId: string; label: string }
  | { type: "changed" }
  | null;

const HTML_PANE =
  "kn-chapter-html max-h-[min(70vh,720px)] overflow-auto text-[13px] leading-[1.65] text-[#1F2423] [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[rgba(78,66,57,0.12)] [&_td]:px-3 [&_td]:py-2.5 [&_th]:border [&_th]:border-[rgba(78,66,57,0.12)] [&_th]:bg-[rgba(78,66,57,0.05)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[12px]";

function kindLabel(kind: ChangeKind): string {
  switch (kind) {
    case "added":
      return "新增";
    case "changed":
      return "变更";
    case "unchanged":
      return "未变";
    case "failed":
      return "失败";
    case "revising":
      return "改写中";
    default:
      return "待生成";
  }
}

function kindClass(kind: ChangeKind): string {
  switch (kind) {
    case "added":
      return "bg-[rgba(47,107,79,0.12)] text-[#2F6B4F]";
    case "changed":
      return "bg-[rgba(160,99,88,0.1)] text-[#A06358]";
    case "failed":
      return "bg-[rgba(160,99,88,0.14)] text-[#A06358]";
    case "revising":
      return "bg-[rgba(176,125,31,0.12)] text-[#8A6218]";
    case "unchanged":
      return "bg-[rgba(78,66,57,0.08)] text-[#59625F]";
    default:
      return "bg-[rgba(78,66,57,0.06)] text-[#969E9A]";
  }
}

function classifyItem(
  item: ChapterDraftItem | undefined,
  liveHtml: string | null,
): ChangeKind {
  if (!item || item.status === "pending") return "pending";
  if (item.status === "revising") return "revising";
  if (item.status === "failed") return "failed";
  const draft = item.html?.trim() ?? "";
  if (!draft) return "failed";
  const live = liveHtml?.trim() ?? "";
  if (!live) return "added";
  if (normalizeHtmlForCompare(draft) === normalizeHtmlForCompare(live)) {
    return "unchanged";
  }
  return "changed";
}

function isPublishableKind(kind: ChangeKind): boolean {
  return kind === "added" || kind === "changed";
}

export default function KnowledgeChapterDraftReviewPage() {
  const { projectId = "", runId = "" } = useParams();
  const navigate = useNavigate();
  const userId = loadSessionUserId() ?? "";
  const project = getMergedProjects().find((p) => p.id === projectId);
  // 审核页在布局外独立路由，刷新时 apiProjects 可能尚未灌入，勿对 undefined 解引用
  const projectRef = {
    id: projectId,
    createdBy: project?.createdBy ?? null,
  };
  const canUpdate = canUpdateProjectKnowledgeNetwork(userId, projectRef);
  const canPublish = canPublishProjectKnowledgeNetwork(userId, projectRef);

  const analysisKind = resolveAnalysisKind(project?.analysisKind);
  const catalogChapters = useMemo(
    () => reviewableChapters(analysisKind),
    [analysisKind],
  );
  const researchChapters = useMemo(
    () => researchSectionsForKind(analysisKind),
    [analysisKind],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState(1);
  const [overviewVersion, setOverviewVersion] = useState(0);
  const [overviewKnVersion, setOverviewKnVersion] = useState(0);
  const [baseVersion, setBaseVersion] = useState(1);
  const [runStatus, setRunStatus] = useState<string>("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>(
    researchChapters[0]!.id,
  );
  const [mode, setMode] = useState<"side" | "diff">("side");
  const [busy, setBusy] = useState<"publish" | "discard" | "submit" | null>(null);
  const [confirm, setConfirm] = useState<ConfirmMode>(null);
  const [publishBump, setPublishBump] = useState<ChapterVersionBump>("minor");
  const [liveHasHtml, setLiveHasHtml] = useState<Record<string, boolean>>(
    {},
  );
  const [chapterBusy, setChapterBusy] = useState<string | null>(null);
  const [hasGraphDraft, setHasGraphDraft] = useState(false);
  const [graphDraftRaw, setGraphDraftRaw] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [reviseSubmitting, setReviseSubmitting] = useState(false);
  const draftPaneRef = useRef<HTMLDivElement>(null);
  const prevRevisingRef = useRef<Set<string>>(new Set());
  const sideSplitRef = useRef<HTMLDivElement>(null);
  /** 并排对比：左侧（当前正式版）宽度占比 25–75 */
  const [sideLeftPct, setSideLeftPct] = useState(() => {
    try {
      const raw = localStorage.getItem("heyu.draftCompare.sideLeftPct");
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n) && n >= 25 && n <= 75) return n;
    } catch {
      /* ignore */
    }
    return 50;
  });
  /** 左右侧栏默认收起，把宽度留给中间对比区 */
  const [navOpen, setNavOpen] = useState(() => {
    try {
      const raw = localStorage.getItem("heyu.draftReview.navOpen");
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch {
      /* ignore */
    }
    return false;
  });
  const [asideOpen, setAsideOpen] = useState(() => {
    try {
      const raw = localStorage.getItem("heyu.draftReview.asideOpen");
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch {
      /* ignore */
    }
    return false;
  });
  const [isLg, setIsLg] = useState(true);
  const sideDraggingRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsLg(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const showNavPanel = !isLg || navOpen;
  const showAsidePanel = !isLg || asideOpen;

  useEffect(() => {
    try {
      localStorage.setItem(
        "heyu.draftCompare.sideLeftPct",
        String(Math.round(sideLeftPct)),
      );
    } catch {
      /* ignore */
    }
  }, [sideLeftPct]);

  useEffect(() => {
    try {
      localStorage.setItem("heyu.draftReview.navOpen", navOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [navOpen]);

  useEffect(() => {
    try {
      localStorage.setItem("heyu.draftReview.asideOpen", asideOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [asideOpen]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!sideDraggingRef.current) return;
      const el = sideSplitRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 40) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSideLeftPct(Math.max(25, Math.min(75, pct)));
    };
    const onUp = () => {
      if (!sideDraggingRef.current) return;
      sideDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const startSideResize = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    sideDraggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const loadReview = useCallback(
    async (opts?: { keepSelection?: boolean; silent?: boolean }) => {
      if (!projectId || !runId || !userId) {
        setError("缺少项目或草案信息");
        setLoading(false);
        return;
      }
      if (!opts?.silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const draft = await fetchChapterDraftRun(projectId, runId, userId);
        setCurrentVersion(draft.currentVersion);
        setOverviewVersion(draft.overviewVersion ?? 0);
        setOverviewKnVersion(draft.overviewKnVersion ?? 0);
        setBaseVersion(draft.run.baseVersion);
        setRunStatus(draft.run.status);
        try {
          const listed = await listProjectKnowledgeChapters(projectId, userId);
          const flags: Record<string, boolean> = {};
          for (const c of listed.chapters) flags[c.sectionId] = c.hasHtml;
          setLiveHasHtml(flags);
        } catch {
          setLiveHasHtml({});
        }

        const reviewIdSet = new Set(catalogChapters.map((c) => c.id));
        const runSectionIds = draft.items
          .map((i) => i.sectionId)
          .filter((id) => reviewIdSet.has(id) || id === "project-overview");
        const graphItem = draft.items.find(
          (i) => i.sectionId === "project-graph" && i.status === "ok",
        );
        const graphRaw = graphItem?.html?.trim() || null;
        setGraphDraftRaw(graphRaw);
        setHasGraphDraft(Boolean(parseProjectGraphHtml(graphRaw)));

        const chaptersToShow =
          draft.run.scope === "section" && runSectionIds.length > 0
            ? catalogChapters.filter((c) => runSectionIds.includes(c.id))
            : researchChapters;

        const liveMap = new Map<string, string | null>();
        await Promise.all(
          chaptersToShow.map(async (ch) => {
            try {
              const live = await fetchProjectKnowledgeChapter(
                projectId,
                ch.id,
                userId,
              );
              liveMap.set(ch.id, live.html);
            } catch {
              liveMap.set(ch.id, null);
            }
          }),
        );

        const itemMap = new Map(
          draft.items.map((i) => [i.sectionId, i] as const),
        );
        const nextRows: ReviewRow[] = chaptersToShow.map((ch) => {
          const item = itemMap.get(ch.id);
          const liveHtml = liveMap.get(ch.id) ?? null;
          const kind = classifyItem(item, liveHtml);
          return {
            id: ch.id,
            label: ch.label,
            kind,
            draftHtml: item?.html ?? null,
            liveHtml,
            error: item?.error ?? null,
            reviseNote: item?.reviseNote ?? null,
          };
        });
        setRows(nextRows);

        const nowRevising = new Set(
          nextRows.filter((r) => r.kind === "revising").map((r) => r.id),
        );
        for (const id of prevRevisingRef.current) {
          if (nowRevising.has(id)) continue;
          const row = nextRows.find((r) => r.id === id);
          if (!row) continue;
          if (row.error?.startsWith("改写失败")) {
            setError(row.error);
            setNotice(null);
          } else {
            setNotice(`「${row.label}」草案改写已完成（尚未发布到正式版）`);
          }
        }
        prevRevisingRef.current = nowRevising;

        if (!opts?.keepSelection) {
          const firstChanged =
            nextRows.find((r) => r.kind === "revising") ??
            nextRows.find((r) => r.kind === "changed" || r.kind === "added") ??
            nextRows.find((r) => r.kind === "failed") ??
            nextRows[0];
          if (firstChanged) setSelectedId(firstChanged.id);
        }
      } catch (e) {
        if (!opts?.silent) {
          setError(e instanceof Error ? e.message : "加载审核数据失败");
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [projectId, runId, userId, catalogChapters, researchChapters],
  );

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;
  const draftGraph = useMemo(
    () => parseProjectGraphHtml(graphDraftRaw),
    [graphDraftRaw],
  );
  const hasRevising = rows.some((r) => r.kind === "revising");
  const reviseBusy =
    reviseSubmitting || selected?.kind === "revising";

  useEffect(() => {
    if (!hasRevising) return;
    const timer = window.setInterval(() => {
      void loadReview({ keepSelection: true, silent: true });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [hasRevising, loadReview]);

  useEffect(() => {
    if (selected?.kind === "revising" && selected.error?.trim()) {
      setInstruction(selected.error);
    }
  }, [selected?.id, selected?.kind, selected?.error]);

  const changedRows = rows.filter((r) => isPublishableKind(r.kind));
  const changedCount = changedRows.length;
  const failedCount = rows.filter((r) => r.kind === "failed").length;
  const previewPublishIds =
    confirm?.type === "one"
      ? [confirm.sectionId]
      : changedRows.map((r) => r.id);
  const flagsAfterPublish = { ...liveHasHtml };
  for (const id of previewPublishIds) {
    const row = rows.find((r) => r.id === id);
    if (row?.draftHtml?.trim()) flagsAfterPublish[id] = true;
  }
  const nextVersion = nextChapterVersion(currentVersion, {
    bump: publishBump,
    allResearchComplete:
      researchChaptersCompleteFromFlags(flagsAfterPublish, analysisKind),
  });
  const overviewOnlyDraft =
    rows.length > 0 && isOverviewOnlyPublish(rows.map((r) => r.id));
  const overviewOnlyPreview = isOverviewOnlyPublish(previewPublishIds);
  const mixedPreview =
    previewPublishIds.includes("project-overview") &&
    previewPublishIds.some((id) => id !== "project-overview");
  const nextOverviewLabel = formatOverviewVersionLabel(overviewVersion + 1);
  const knForOverviewLabel = formatChapterVersionLabel(
    mixedPreview ? nextVersion : currentVersion,
  );
  const currentVersionLabel = formatChapterVersionLabel(currentVersion);
  const baseVersionLabel = formatChapterVersionLabel(baseVersion);
  const nextVersionLabel = overviewOnlyPreview
    ? `${nextOverviewLabel}（对应 ${knForOverviewLabel}）`
    : formatChapterVersionLabel(nextVersion);
  const preRelease = isPreReleaseChapterVersion(currentVersion);
  const addableChapters = catalogChapters.filter(
    (c) => !rows.some((r) => r.id === c.id),
  );
  const runOpen =
    runStatus === "ready" || runStatus === "failed" || runStatus === "generating";
  const actionLocked =
    busy !== null || editBusy || reviseSubmitting;
  const canPublishSelected =
    canPublish &&
    !actionLocked &&
    runOpen &&
    selected != null &&
    isPublishableKind(selected.kind);
  const canPublishChanged =
    canPublish && !actionLocked && runOpen && changedCount > 0;
  const draftEditableSection =
    canUpdate &&
    runOpen &&
    selected != null &&
    selected.kind !== "failed" &&
    selected.kind !== "pending" &&
    selected.kind !== "revising" &&
    Boolean(selected.draftHtml?.trim() || editing);
  const canEditDraft = draftEditableSection && !actionLocked;
  const showReviseBar =
    canUpdate &&
    runOpen &&
    selected != null &&
    (selected.kind === "revising" ||
      (selected.kind !== "failed" &&
        selected.kind !== "pending" &&
        Boolean(selected.draftHtml?.trim() || editing)));

  const applyDraftHtml = useCallback(
    (sectionId: string, html: string) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== sectionId) return r;
          const kind = classifyItem(
            {
              sectionId,
              status: "ok",
              html,
              updatedAt: new Date().toISOString(),
            },
            r.liveHtml,
          );
          return { ...r, draftHtml: html, kind, error: null };
        }),
      );
    },
    [],
  );

  const selectSection = (id: string) => {
    if (id === selectedId) return;
    if (editing) {
      if (
        !window.confirm("当前编辑未保存，切换章节将丢弃修改。确定继续？")
      ) {
        return;
      }
      setEditing(false);
    }
    setSelectedId(id);
    const row = rows.find((r) => r.id === id);
    if (row?.kind === "revising" && row.error?.trim()) {
      setInstruction(row.error);
    } else {
      setInstruction("");
    }
  };

  const startEdit = () => {
    if (!canEditDraft || !selected) return;
    setMode("side");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!selected || !draftPaneRef.current) return;
    const html = draftPaneRef.current.innerHTML.trim();
    if (!html) {
      setError("草案内容不能为空");
      return;
    }
    setEditBusy(true);
    setError(null);
    try {
      const res = await saveChapterDraftSection(
        projectId,
        runId,
        selected.id,
        userId,
        html,
      );
      applyDraftHtml(selected.id, res.html);
      setEditing(false);
      setNotice("草案已保存（尚未发布到正式版）");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存草案失败");
    } finally {
      setEditBusy(false);
    }
  };

  const onRevise = async () => {
    if (!selected || !canEditDraft) return;
    const text = instruction.trim();
    if (!text) return;
    if (editing) {
      if (
        !window.confirm("改写将覆盖当前未保存的手改。确定继续？")
      ) {
        return;
      }
      setEditing(false);
    }
    setReviseSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await reviseChapterDraftSection(
        projectId,
        runId,
        selected.id,
        userId,
        text,
      );
      prevRevisingRef.current = new Set([
        ...prevRevisingRef.current,
        selected.id,
      ]);
      setRows((prev) =>
        prev.map((r) =>
          r.id === selected.id
            ? {
                ...r,
                kind: "revising",
                error: res.instruction,
              }
            : r,
        ),
      );
      setInstruction(res.instruction);
      setNotice("改写已开始，可刷新页面查看进度");
    } catch (e) {
      setError(e instanceof Error ? e.message : "改写失败");
    } finally {
      setReviseSubmitting(false);
    }
  };

  useEffect(() => {
    if (!editing || !draftPaneRef.current || !selected?.draftHtml) return;
    draftPaneRef.current.innerHTML = stripAuthoringHintsFromHtml(
      selected.draftHtml,
    );
    // 进入编辑时灌入当前已保存草案；不随后续 draftHtml 覆盖手改中内容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, selectedId]);

  const diffParts = useMemo(() => {
    if (!selected || selected.kind === "failed" || selected.kind === "pending") {
      return [];
    }
    return diffLines(
      stripHtmlToText(selected.liveHtml ?? ""),
      stripHtmlToText(selected.draftHtml ?? ""),
    );
  }, [selected]);

  const doPublish = async (sectionIds: string[]) => {
    if (!canPublish || sectionIds.length === 0) return;
    setBusy("publish");
    setError(null);
    setNotice(null);
    try {
      const res = await publishChapterDraftRun(projectId, runId, userId, {
        sectionIds,
        bump: publishBump,
      });
      setConfirm(null);
      if (res.runClosed) {
        const publishedOverview = Boolean(res.publishedOverview);
        navigate(
          publishedOverview
            ? `/app/projects/${projectId}/overview`
            : `/app/projects/${projectId}/knowledge`,
          {
            replace: true,
            state: {
              knowledgePublishedVersion: res.publishedKnowledge
                ? res.newVersion
                : undefined,
              overviewPublishedVersion: res.publishedOverview
                ? res.overviewVersion
                : undefined,
              overviewKnVersion: res.overviewKnVersion,
            },
          },
        );
        return;
      }
      setNotice(
        res.publishedOverview && !res.publishedKnowledge
          ? `已发布项目概览 ${formatOverviewVersionLabel(res.overviewVersion)}（对应知识网络 ${formatChapterVersionLabel(res.overviewKnVersion ?? res.newVersion)}）。`
          : `已发布 ${res.appliedSections.filter((id) => id !== "sources" && id !== "glossary").length} 章为 ${formatChapterVersionLabel(res.newVersion)}。其余变更可继续审核发布。`,
      );
      await loadReview({ keepSelection: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "发布失败");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const onDiscard = async () => {
    if (!canUpdate || busy) return;
    if (!window.confirm("确定放弃本草案？已发布的正式章不会改变。")) return;
    setBusy("discard");
    setError(null);
    try {
      await discardChapterDraftRun(projectId, runId, userId);
      navigate(`/app/projects/${projectId}/knowledge`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "放弃失败");
      setBusy(null);
    }
  };

  const onSubmitForReview = async () => {
    if (canPublish || !canUpdate || busy) return;
    if (runStatus === "generating") return;
    if (
      !window.confirm(
        "将本草案提交给项目管理员审批？正式版不会立刻改动，项目管理员审核后才会发布。",
      )
    ) {
      return;
    }
    setBusy("submit");
    setError(null);
    setNotice(null);
    try {
      await submitChapterDraftRun(projectId, runId, userId);
      setNotice("已提交项目管理员审批。你可继续改写，改完后可再次提交。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交审批失败");
    } finally {
      setBusy(null);
    }
  };

  const confirmCopy = (() => {
    if (!confirm) return { title: "", body: "" };
    if (confirm.type === "one") {
      return {
        title: overviewOnlyPreview
          ? `确认发布「${confirm.label}」？`
          : `确认发布「${confirm.label}」为 ${nextVersionLabel}？`,
        body: overviewOnlyPreview
          ? `将发布为 ${nextOverviewLabel}。`
          : `将发布为 ${nextVersionLabel}。其他章节不受影响。`,
      };
    }
    return {
      title: overviewOnlyPreview
        ? "确认发布项目概览？"
        : mixedPreview
          ? `确认发布为 ${nextVersionLabel}？`
          : `确认发布全部 ${changedCount} 处变更为 ${nextVersionLabel}？`,
      body: overviewOnlyPreview
        ? `将发布为 ${nextOverviewLabel}。`
        : `将发布为 ${nextVersionLabel}。未改动的章节保持原样。`,
    };
  })();

  const onRemoveChapter = async (sectionId: string, label: string) => {
    if (!canUpdate || actionLocked) return;
    if (!window.confirm(`从本次草案移除「${label}」？不会删除正式版已有内容。`)) {
      return;
    }
    setChapterBusy(sectionId);
    setError(null);
    try {
      await deleteChapterDraftSection(projectId, runId, sectionId, userId);
      setNotice(`已移除「${label}」`);
      await loadReview({ keepSelection: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "移除章节失败");
    } finally {
      setChapterBusy(null);
    }
  };

  const onAddChapter = async (sectionId: string) => {
    if (!canUpdate || actionLocked || !sectionId) return;
    const label =
      catalogChapters.find((c) => c.id === sectionId)?.label ?? sectionId;
    setChapterBusy(sectionId);
    setError(null);
    setNotice(null);
    try {
      await generateChapterDraftSection(projectId, runId, sectionId, userId);
      setNotice(`已加入「${label}」并开始生成草案`);
      await loadReview({ keepSelection: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加章节失败");
    } finally {
      setChapterBusy(null);
    }
  };

  return (
    <WorkspaceShell contentClassName="!overflow-y-auto">
      <div className="mx-auto w-full max-w-[1920px] px-3 py-5 md:px-5 lg:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium tracking-wide text-[#A06358]">
              知识网络 · 更新审核
            </div>
            <h1 className="mt-1 font-[family-name:var(--font-serif,serif)] text-[26px] font-semibold text-[#1F2423]">
              {rows.length === 1
                ? `审核「${rows[0]!.label}」更新草案`
                : "审核章节更新草案"}
            </h1>
            <p className="mt-1.5 max-w-3xl text-[13px] text-[#59625F]">
              对照当前正式版与本次更新，确认后再发布。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setNavOpen(false);
                setAsideOpen(false);
              }}
              className="hidden h-8 items-center rounded-lg border border-[rgba(78,66,57,0.14)] px-2.5 text-[12px] font-medium text-[#59625F] hover:bg-[rgba(78,66,57,0.04)] lg:inline-flex"
              title="收起左右侧栏，扩大中间对比区"
            >
              专注对比
            </button>
            <Link
              to={`/app/projects/${projectId}/knowledge`}
              className="text-[13px] font-medium text-[#A06358] hover:underline"
            >
              返回知识网络
            </Link>
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-xl border border-[rgba(160,99,88,0.25)] bg-[rgba(160,99,88,0.06)] px-3.5 py-2 text-[12.5px] text-[#A06358]">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mb-4 rounded-xl border border-[rgba(94,155,117,0.28)] bg-[rgba(94,155,117,0.08)] px-3.5 py-2 text-[12.5px] text-[#2F6B4F]">
            {notice}
          </p>
        ) : null}

        {loading && rows.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
            加载审核数据…
          </div>
        ) : (
          <div
            className="grid gap-2 lg:grid-cols-[var(--review-nav)_minmax(0,1fr)_var(--review-aside)]"
            style={
              {
                ["--review-nav"]: showNavPanel ? "168px" : "44px",
                ["--review-aside"]: showAsidePanel ? "220px" : "44px",
              } as Record<string, string>
            }
          >
            <aside className="overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.9)]">
              {showNavPanel ? (
                <>
                  <div className="flex items-center justify-between gap-2 border-b border-[rgba(78,66,57,0.1)] px-3 py-2.5">
                    <div className="text-[12px] font-semibold text-[#59625F]">
                      章节列表
                    </div>
                    <div className="flex items-center gap-1">
                      {canUpdate && addableChapters.length > 0 ? (
                        <label className="relative inline-flex items-center">
                          <select
                            className="h-7 max-w-[6.5rem] appearance-none rounded-md border border-[rgba(160,99,88,0.3)] bg-white pl-2 pr-6 text-[11px] font-medium text-[#A06358]"
                            defaultValue=""
                            disabled={Boolean(chapterBusy) || actionLocked}
                            onChange={(e) => {
                              const id = e.target.value;
                              e.currentTarget.value = "";
                              if (id) void onAddChapter(id);
                            }}
                            aria-label="增加章节"
                          >
                            <option value="" disabled>
                              + 增加
                            </option>
                            {addableChapters.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <Plus className="pointer-events-none absolute right-1.5 h-3 w-3 text-[#A06358]" />
                        </label>
                      ) : null}
                      {isLg ? (
                        <button
                          type="button"
                          onClick={() => setNavOpen(false)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#969E9A] hover:bg-[rgba(78,66,57,0.06)] hover:text-[#59625F]"
                          title="收起章节列表"
                          aria-label="收起章节列表"
                        >
                          <PanelLeftClose className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <ul className="max-h-[min(70vh,760px)] overflow-auto p-1.5">
                    {rows.map((r) => (
                      <li key={r.id} className="group flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => selectSection(r.id)}
                          className={cn(
                            "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors",
                            selectedId === r.id
                              ? "bg-[#EFE7E6] font-semibold text-[#A06358]"
                              : "text-[#1F2423] hover:bg-[rgba(78,66,57,0.05)]",
                          )}
                        >
                          <span className="truncate">{r.label}</span>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium",
                              kindClass(r.kind),
                            )}
                          >
                            {kindLabel(r.kind)}
                          </span>
                        </button>
                        {canUpdate && runOpen ? (
                          <button
                            type="button"
                            title={`移除「${r.label}」`}
                            disabled={
                              Boolean(chapterBusy) ||
                              actionLocked ||
                              rows.length <= 1
                            }
                            onClick={() => void onRemoveChapter(r.id, r.label)}
                            className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#969E9A] opacity-70 hover:bg-[rgba(160,99,88,0.1)] hover:text-[#A06358] disabled:opacity-30 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="flex h-full min-h-[12rem] flex-col items-center gap-2 py-3">
                  <button
                    type="button"
                    onClick={() => setNavOpen(true)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#A06358] hover:bg-[#EFE7E6]"
                    title="展开章节列表"
                    aria-label="展开章节列表"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <span
                    className="select-none text-[11px] font-medium tracking-wide text-[#969E9A]"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    章节
                  </span>
                </div>
              )}
            </aside>

            <main className="min-w-0 overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.85)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(78,66,57,0.1)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  {!navOpen ? (
                    <button
                      type="button"
                      onClick={() => setNavOpen(true)}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgba(78,66,57,0.12)] px-2 text-[11.5px] font-medium text-[#59625F] hover:bg-[rgba(78,66,57,0.04)] lg:hidden"
                    >
                      章节
                    </button>
                  ) : null}
                  <div className="text-[14px] font-semibold text-[#1F2423]">
                    {selected?.label ?? "章节"}
                    {loading ? (
                      <span className="ml-2 text-[12px] font-normal text-[#969E9A]">
                        刷新中…
                      </span>
                    ) : null}
                    {reviseBusy ? (
                      <span className="ml-2 text-[12px] font-normal text-[#8A6218]">
                        改写中…
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!asideOpen && isLg ? (
                    <button
                      type="button"
                      onClick={() => setAsideOpen(true)}
                      className="inline-flex h-7 items-center rounded-md border border-[rgba(160,99,88,0.28)] bg-[#EFE7E6] px-2.5 text-[11.5px] font-medium text-[#A06358] hover:bg-[#E8DDDB]"
                    >
                      摘要 / 发布
                    </button>
                  ) : null}
                  <div className="inline-flex rounded-lg bg-[rgba(78,66,57,0.07)] p-0.5">
                    {(
                      [
                        ["side", "并排"],
                        ["diff", "差异"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          if (id === "diff" && editing) {
                            if (
                              !window.confirm(
                                "切换到差异视图将退出编辑且不保存。继续？",
                              )
                            ) {
                              return;
                            }
                            setEditing(false);
                          }
                          setMode(id);
                        }}
                        className={cn(
                          "h-7 rounded-md px-3 text-[12px] font-medium",
                          mode === id
                            ? "bg-[#1F2423] text-white"
                            : "text-[#59625F]",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {showReviseBar ? (
                <div className="space-y-2 border-b border-[rgba(78,66,57,0.08)] px-4 py-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <textarea
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      rows={2}
                      disabled={
                        reviseBusy ||
                        editBusy ||
                        editing ||
                        busy !== null ||
                        selected?.kind === "revising"
                      }
                      placeholder="输入对草案的改写指令，例如：把研究结论写得更简洁"
                      className="min-h-[48px] min-w-[220px] flex-1 resize-y rounded-xl border border-[rgba(78,66,57,0.12)] bg-white/80 px-3 py-2 text-[13px] leading-relaxed text-[#1F2423] outline-none placeholder:text-[#969E9A] focus:border-[rgba(160,99,88,0.35)] disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => void onRevise()}
                      disabled={
                        !canEditDraft ||
                        editing ||
                        !instruction.trim() ||
                        selected?.kind === "revising"
                      }
                      className="h-10 shrink-0 rounded-[9px] bg-[#A06358] px-4 text-[13px] font-medium text-white hover:bg-[#8F564C] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {reviseBusy || selected?.kind === "revising"
                        ? "改写中…"
                        : "改写草案"}
                    </button>
                  </div>
                  {selected?.kind === "revising" ? (
                    <div className="rounded-xl border border-[rgba(176,125,31,0.22)] bg-[rgba(176,125,31,0.06)] px-3.5 py-2.5">
                      <p className="text-[12px] font-semibold text-[#8A6218]">
                        正在按你的意见改写…
                      </p>
                      {selected.error?.trim() ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#59625F]">
                          指令：{selected.error}
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-[12px] leading-relaxed text-[#969E9A]">
                        完成后会在此显示「本次改写说明」；刷新页面仍会保留此状态，完成后自动更新。
                      </p>
                    </div>
                  ) : selected?.reviseNote?.trim() ? (
                    <div className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/90 px-3.5 py-2.5 shadow-[0_1px_0_rgba(78,66,57,0.04)]">
                      <p className="text-[12px] font-semibold text-[#A06358]">
                        本次改写说明
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#1F2423]">
                        {selected.reviseNote}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="p-4">
                {!selected ? (
                  <p className="text-[13px] text-[#969E9A]">暂无章节</p>
                ) : selected.kind === "failed" ? (
                  <div className="rounded-xl border border-[rgba(160,99,88,0.2)] bg-[rgba(160,99,88,0.05)] px-4 py-5">
                    <p className="text-[13px] font-medium text-[#A06358]">
                      本章生成失败，无法单独发布
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-[12.5px] text-[#59625F]">
                      {selected.error || "未知错误"}
                    </p>
                  </div>
                ) : selected.kind === "pending" ? (
                  <p className="text-[13px] text-[#969E9A]">本章仍在生成中…</p>
                ) : selected.kind === "revising" ? (
                  selected.draftHtml?.trim() ? (
                    <div className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/70 p-3">
                      <div className="mb-2 text-[12px] font-semibold text-[#59625F]">
                        改写前草案（只读）
                      </div>
                      <div
                        className={HTML_PANE}
                        dangerouslySetInnerHTML={{
                          __html: stripAuthoringHintsFromHtml(
                            selected.draftHtml,
                          ),
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-[13px] text-[#969E9A]">
                      改写进行中，请稍候…
                    </p>
                  )
                ) : mode === "side" ? (
                  <div
                    ref={sideSplitRef}
                    className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0"
                    style={
                      { ["--side-left-pct"]: `${sideLeftPct}%` } as Record<
                        string,
                        string
                      >
                    }
                  >
                    <div className="min-w-0 w-full rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/70 md:w-[var(--side-left-pct)] md:shrink-0 md:grow-0 md:rounded-r-none">
                      <div className="border-b border-[rgba(78,66,57,0.08)] px-3 py-2 text-[12px] font-semibold text-[#59625F]">
                        当前 {currentVersionLabel}
                      </div>
                      <div className="p-3">
                        {selected.liveHtml?.trim() ? (
                          <div
                            className={HTML_PANE}
                            dangerouslySetInnerHTML={{
                              __html: stripAuthoringHintsFromHtml(
                                selected.liveHtml,
                              ),
                            }}
                          />
                        ) : (
                          <p className="text-[12.5px] text-[#969E9A]">
                            （当前无正式内容）
                          </p>
                        )}
                      </div>
                    </div>
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="拖动调整左右栏宽度"
                      aria-valuemin={25}
                      aria-valuemax={75}
                      aria-valuenow={Math.round(sideLeftPct)}
                      tabIndex={0}
                      onPointerDown={startSideResize}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          setSideLeftPct((p) => Math.max(25, p - 2));
                        } else if (e.key === "ArrowRight") {
                          e.preventDefault();
                          setSideLeftPct((p) => Math.min(75, p + 2));
                        }
                      }}
                      className="group relative hidden w-3 shrink-0 cursor-col-resize touch-none md:block"
                      title="左右拖动调整宽度"
                    >
                      <div className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-[rgba(78,66,57,0.18)] transition-colors group-hover:bg-[rgba(160,99,88,0.55)] group-focus-visible:bg-[rgba(160,99,88,0.55)]" />
                      <div className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(78,66,57,0.22)] transition-colors group-hover:bg-[rgba(160,99,88,0.65)] group-focus-visible:bg-[rgba(160,99,88,0.65)]" />
                    </div>
                    <div className="min-w-0 flex-1 rounded-xl border border-[rgba(160,99,88,0.18)] bg-white/70 md:rounded-l-none">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(160,99,88,0.12)] px-3 py-2">
                        <div className="text-[12px] font-semibold text-[#A06358]">
                          待审核草案
                          {editing ? (
                            <span className="ml-2 font-normal text-[#8A6218]">
                              编辑中
                            </span>
                          ) : null}
                        </div>
                        {draftEditableSection ? (
                          <div className="flex flex-wrap gap-1.5">
                            {!editing ? (
                              <button
                                type="button"
                                onClick={startEdit}
                                disabled={!canEditDraft}
                                className="h-7 rounded-md border border-[rgba(160,99,88,0.3)] px-2.5 text-[11.5px] font-medium text-[#A06358] hover:bg-[#EFE7E6] disabled:opacity-45"
                              >
                                编辑
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={editBusy}
                                  className="h-7 rounded-md border border-[rgba(78,66,57,0.18)] px-2.5 text-[11.5px] font-medium text-[#1F2423] disabled:opacity-45"
                                >
                                  取消
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void saveEdit()}
                                  disabled={editBusy}
                                  className="h-7 rounded-md bg-[#A06358] px-2.5 text-[11.5px] font-medium text-white hover:bg-[#8F564C] disabled:opacity-45"
                                >
                                  {editBusy ? "保存中…" : "保存草案"}
                                </button>
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="p-3">
                        {selected.draftHtml?.trim() || editing ? (
                          <div
                            ref={draftPaneRef}
                            contentEditable={editing}
                            suppressContentEditableWarning
                            className={cn(
                              HTML_PANE,
                              selected.id === "project-overview" &&
                                "[&_#project-graph-slot]:hidden",
                              editing &&
                                "outline outline-2 outline-[rgba(160,99,88,0.25)] outline-offset-2 rounded-md",
                            )}
                            {...(editing
                              ? {}
                              : {
                                  dangerouslySetInnerHTML: {
                                    __html: stripAuthoringHintsFromHtml(
                                      selected.draftHtml ?? "",
                                    ),
                                  },
                                })}
                          />
                        ) : (
                          <p className="text-[12.5px] text-[#969E9A]">
                            （草案为空）
                          </p>
                        )}
                        {selected.id === "project-overview" && !editing ? (
                          draftGraph ? (
                            <div className="mt-3">
                              <ProjectRelationGraph
                                data={draftGraph}
                                projectId={projectId}
                              />
                            </div>
                          ) : (
                            <p className="mt-3 rounded-lg border border-dashed border-[rgba(163,38,44,0.28)] bg-[rgba(255,252,248,0.78)] px-3 py-3 text-[12.5px] leading-relaxed text-[#59625F]">
                              此次概览没有解析出关系图。上面虚线框只是模板占位，不是图；发布后正式概览也不会出现图。请放弃草案后再次「更新概览」。
                            </p>
                          )
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[min(70vh,720px)] overflow-auto rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/80 p-3 font-mono text-[12px] leading-[1.65]">
                    {diffParts.length === 0 ? (
                      <p className="font-sans text-[12.5px] text-[#969E9A]">
                        无文本差异
                      </p>
                    ) : (
                      diffParts.map((part, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "whitespace-pre-wrap px-1.5 py-0.5",
                            part.type === "add" &&
                              "bg-[rgba(47,107,79,0.12)] text-[#1F4D35]",
                            part.type === "remove" &&
                              "bg-[rgba(160,99,88,0.1)] text-[#722F37] line-through",
                            part.type === "equal" && "text-[#59625F]",
                          )}
                        >
                          {part.type === "add"
                            ? "+ "
                            : part.type === "remove"
                              ? "- "
                              : "  "}
                          {part.value}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </main>

            <aside className="overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.9)]">
              {showAsidePanel ? (
                <div className="p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold text-[#59625F]">
                      摘要
                    </div>
                    {isLg ? (
                      <button
                        type="button"
                        onClick={() => setAsideOpen(false)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#969E9A] hover:bg-[rgba(78,66,57,0.06)] hover:text-[#59625F]"
                        title="收起摘要"
                        aria-label="收起摘要"
                      >
                        <PanelRightClose className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <dl className="mt-3 space-y-2 text-[13px] text-[#1F2423]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#59625F]">待发布变更</dt>
                      <dd className="font-semibold">{changedCount}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#59625F]">失败章节</dt>
                      <dd className="font-semibold text-[#A06358]">
                        {failedCount}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#59625F]">基于版本</dt>
                      <dd className="font-semibold">{baseVersionLabel}</dd>
                    </div>
                    {overviewOnlyDraft ? (
                      <>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#59625F]">当前概览</dt>
                      <dd className="font-semibold">
                        {formatOverviewVersionLabel(overviewVersion)}
                        {overviewKnVersion > 0
                          ? ` · ${formatChapterVersionLabel(overviewKnVersion)}`
                          : ""}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#59625F]">对应知识网络</dt>
                      <dd className="font-semibold">{knForOverviewLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#59625F]">下次发布</dt>
                      <dd className="font-semibold">{nextOverviewLabel}</dd>
                    </div>
                      </>
                    ) : (
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#59625F]">下次发布</dt>
                      <dd className="font-semibold">{nextVersionLabel}</dd>
                    </div>
                    )}
                  </dl>

                  <div className="mt-4 space-y-1.5">
                    {canPublish && !overviewOnlyDraft ? (
                      <>
                    <div className="text-[12px] font-semibold text-[#59625F]">
                      版本递增
                    </div>
                    {preRelease ? (
                      <p className="rounded-lg border border-[rgba(78,66,57,0.1)] px-2.5 py-2 text-[12px] leading-relaxed text-[#59625F]">
                        本次将发布为{" "}
                        <span className="font-medium text-[#1F2423]">
                          {nextVersionLabel}
                        </span>
                      </p>
                    ) : (
                      <>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[rgba(78,66,57,0.1)] px-2.5 py-2 text-[12px]">
                      <input
                        type="radio"
                        name="publish-bump"
                        className="mt-0.5"
                        checked={publishBump === "patch"}
                        onChange={() => setPublishBump("patch")}
                      />
                      <span>
                        <span className="font-medium text-[#1F2423]">
                          补丁
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[#59625F]">
                          局部修正 →{" "}
                          {formatChapterVersionLabel(
                            bumpChapterVersion(currentVersion, "patch"),
                          )}
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[rgba(78,66,57,0.1)] px-2.5 py-2 text-[12px]">
                      <input
                        type="radio"
                        name="publish-bump"
                        className="mt-0.5"
                        checked={publishBump === "minor"}
                        onChange={() => setPublishBump("minor")}
                      />
                      <span>
                        <span className="font-medium text-[#1F2423]">
                          次版本
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[#59625F]">
                          一批小改 →{" "}
                          {formatChapterVersionLabel(
                            bumpChapterVersion(currentVersion, "minor"),
                          )}
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[rgba(78,66,57,0.1)] px-2.5 py-2 text-[12px]">
                      <input
                        type="radio"
                        name="publish-bump"
                        className="mt-0.5"
                        checked={publishBump === "major"}
                        onChange={() => setPublishBump("major")}
                      />
                      <span>
                        <span className="font-medium text-[#1F2423]">
                          主版本
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[#59625F]">
                          结构大改 →{" "}
                          {formatChapterVersionLabel(
                            bumpChapterVersion(currentVersion, "major"),
                          )}
                        </span>
                      </span>
                    </label>
                      </>
                    )}
                      </>
                    ) : null}
                  </div>

                  {hasGraphDraft && selected?.id === "project-overview" ? (
                    <p className="mt-3 text-[12px] leading-relaxed text-[#59625F]">
                      含关系图
                    </p>
                  ) : null}

                  {!canPublish && canUpdate ? (
                    <p className="mt-4 text-[12px] leading-relaxed text-[#59625F]">
                      改完后点「提交审批」。
                    </p>
                  ) : !canUpdate ? (
                    <p className="mt-4 text-[12px] leading-relaxed text-[#969E9A]">
                      当前角色无权更新或发布草案。
                    </p>
                  ) : null}

                  {canPublish ? (
                    <>
                  <button
                    type="button"
                    disabled={!canPublishSelected || editing}
                    onClick={() => {
                      if (!selected) return;
                      setConfirm({
                        type: "one",
                        sectionId: selected.id,
                        label: selected.label,
                      });
                    }}
                    className="mt-5 flex h-10 w-full items-center justify-center rounded-[11px] bg-[#A06358] text-[13.5px] font-medium text-white hover:bg-[#8F564C] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busy === "publish" && confirm?.type === "one"
                      ? "发布中…"
                      : selected && isPublishableKind(selected.kind)
                        ? `发布本章 · ${selected.label}`
                        : "发布本章"}
                  </button>
                  <button
                    type="button"
                    disabled={!canPublishChanged || editing}
                    onClick={() => setConfirm({ type: "changed" })}
                    className="mt-2.5 flex h-10 w-full items-center justify-center rounded-[11px] border border-[hsl(var(--wine)/0.35)] bg-[hsl(var(--wine-muted))] text-[13.5px] font-medium text-[hsl(var(--wine))] hover:bg-[#EFE7E6] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busy === "publish" && confirm?.type === "changed"
                      ? "发布中…"
                      : `发布全部变更（${changedCount}）`}
                  </button>
                    </>
                  ) : canUpdate ? (
                    <button
                      type="button"
                      disabled={
                        actionLocked ||
                        editing ||
                        runStatus === "generating" ||
                        runStatus === "published" ||
                        runStatus === "discarded"
                      }
                      onClick={() => void onSubmitForReview()}
                      className="mt-5 flex h-10 w-full items-center justify-center rounded-[11px] bg-[#A06358] text-[13.5px] font-medium text-white hover:bg-[#8F564C] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {busy === "submit"
                        ? "提交中…"
                        : runStatus === "generating"
                          ? "生成完成后可提交审批"
                          : "提交审批"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={
                      !canUpdate ||
                      actionLocked ||
                      editing ||
                      runStatus === "published"
                    }
                    onClick={() => void onDiscard()}
                    className={
                      canPublish
                        ? "mt-2.5 flex h-10 w-full items-center justify-center rounded-[11px] border border-[rgba(78,66,57,0.18)] text-[13.5px] font-medium text-[#1F2423] hover:bg-[rgba(78,66,57,0.04)] disabled:cursor-not-allowed disabled:opacity-45"
                        : "mt-5 flex h-10 w-full items-center justify-center rounded-[11px] border border-[rgba(78,66,57,0.18)] text-[13.5px] font-medium text-[#1F2423] hover:bg-[rgba(78,66,57,0.04)] disabled:cursor-not-allowed disabled:opacity-45"
                    }
                  >
                    {busy === "discard" ? "处理中…" : "放弃草案"}
                  </button>
                  {canUpdate ? (
                    <p className="mt-2 text-center text-[11.5px] leading-relaxed text-[#969E9A]">
                      放弃不影响已发布的正式章。
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full min-h-[12rem] flex-col items-center gap-2 py-3">
                  <button
                    type="button"
                    onClick={() => setAsideOpen(true)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#A06358] hover:bg-[#EFE7E6]"
                    title="展开摘要"
                    aria-label="展开摘要"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span
                    className="select-none text-[11px] font-medium tracking-wide text-[#969E9A]"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    发布
                  </span>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>

      {confirm ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-[14px] border border-[rgba(78,66,57,0.12)] bg-[hsl(var(--paper))] p-6 shadow-2xl">
            <h2 className="text-base font-bold text-[#1F2423]">
              {confirmCopy.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#59625F]">
              {confirmCopy.body}
            </p>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={busy === "publish"}
                className="h-10 flex-1 rounded-xl border border-[rgba(78,66,57,0.18)] text-sm font-medium"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm.type === "one") {
                    void doPublish([confirm.sectionId]);
                  } else {
                    void doPublish(changedRows.map((r) => r.id));
                  }
                }}
                disabled={busy === "publish"}
                className="h-10 flex-1 rounded-xl bg-[#A06358] text-sm font-semibold text-white"
              >
                {busy === "publish" ? "发布中…" : "确认发布"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
