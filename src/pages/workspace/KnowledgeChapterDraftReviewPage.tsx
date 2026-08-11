import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { cn } from "@/lib/utils";
import {
  discardChapterDraftRun,
  fetchChapterDraftRun,
  fetchProjectKnowledgeChapter,
  publishChapterDraftRun,
  reviseChapterDraftSection,
  saveChapterDraftSection,
  type ChapterDraftItem,
} from "@/lib/project-api";
import {
  diffLines,
  normalizeHtmlForCompare,
  stripHtmlToText,
} from "@/lib/text-line-diff";
import { loadSessionUserId } from "@/workspace/session";
import { canPublishProjectKnowledgeNetwork } from "@/workspace/project-manage";
import { getMergedProjects } from "@/workspace/project-registry";

const OVERVIEW_CHAPTER = { id: "project-overview", label: "项目概览" };

const RESEARCH_CHAPTERS: { id: string; label: string }[] = [
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

/** 审核页可展示的主章节（研究章 + 概览） */
const REVIEWABLE_CHAPTERS: { id: string; label: string }[] = [
  OVERVIEW_CHAPTER,
  ...RESEARCH_CHAPTERS,
];

type ChangeKind = "added" | "changed" | "unchanged" | "failed" | "pending" | "revising";

type ReviewRow = {
  id: string;
  label: string;
  kind: ChangeKind;
  draftHtml: string | null;
  liveHtml: string | null;
  error: string | null;
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
  const canPublish = canPublishProjectKnowledgeNetwork(userId, {
    id: projectId,
    createdBy: project?.createdBy ?? null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState(1);
  const [baseVersion, setBaseVersion] = useState(1);
  const [runStatus, setRunStatus] = useState<string>("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>(
    RESEARCH_CHAPTERS[0]!.id,
  );
  const [mode, setMode] = useState<"side" | "diff">("side");
  const [busy, setBusy] = useState<"publish" | "discard" | null>(null);
  const [confirm, setConfirm] = useState<ConfirmMode>(null);
  const [hasGraphDraft, setHasGraphDraft] = useState(false);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [reviseSubmitting, setReviseSubmitting] = useState(false);
  const draftPaneRef = useRef<HTMLDivElement>(null);
  const prevRevisingRef = useRef<Set<string>>(new Set());

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
        setBaseVersion(draft.run.baseVersion);
        setRunStatus(draft.run.status);

        const reviewIdSet = new Set(REVIEWABLE_CHAPTERS.map((c) => c.id));
        const runSectionIds = draft.items
          .map((i) => i.sectionId)
          .filter((id) => reviewIdSet.has(id));
        const graphItem = draft.items.find(
          (i) => i.sectionId === "project-graph" && i.status === "ok",
        );
        setHasGraphDraft(Boolean(graphItem?.html?.trim()));

        // 单章/概览草案只展示 run 内章节；全量草案展示 13 研究章
        const chaptersToShow =
          draft.run.scope === "section" && runSectionIds.length > 0
            ? REVIEWABLE_CHAPTERS.filter((c) => runSectionIds.includes(c.id))
            : RESEARCH_CHAPTERS;

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
    [projectId, runId, userId],
  );

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;
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
  const nextVersion = currentVersion + 1;
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
    canPublish &&
    runOpen &&
    selected != null &&
    selected.kind !== "failed" &&
    selected.kind !== "pending" &&
    selected.kind !== "revising" &&
    Boolean(selected.draftHtml?.trim() || editing);
  const canEditDraft = draftEditableSection && !actionLocked;
  const showReviseBar =
    canPublish &&
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
    draftPaneRef.current.innerHTML = selected.draftHtml;
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
    if (sectionIds.length === 0) return;
    setBusy("publish");
    setError(null);
    setNotice(null);
    try {
      const res = await publishChapterDraftRun(projectId, runId, userId, {
        sectionIds,
      });
      setConfirm(null);
      if (res.runClosed) {
        const publishedOverview = sectionIds.includes("project-overview");
        navigate(
          publishedOverview
            ? `/app/projects/${projectId}/overview`
            : `/app/projects/${projectId}/knowledge`,
          {
            replace: true,
            state: { knowledgePublishedVersion: res.newVersion },
          },
        );
        return;
      }
      setNotice(
        `已发布 ${res.appliedSections.filter((id) => id !== "sources" && id !== "glossary").length} 章为 v${res.newVersion}。其余变更可继续审核发布。`,
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
    if (!canPublish || busy) return;
    if (!window.confirm("确定放弃本草案？正式章节内容不会改变。")) return;
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

  const confirmCopy = (() => {
    if (!confirm) return { title: "", body: "" };
    if (confirm.type === "one") {
      return {
        title: `确认发布「${confirm.label}」为 v${nextVersion}？`,
        body: `仅将本章草案写入正式知识网络，并把当前正式内容归档为 v${currentVersion}。其他章节不受影响，可继续审核。`,
      };
    }
    return {
      title: `确认发布全部 ${changedCount} 处变更为 v${nextVersion}？`,
      body: `将把所有「新增/变更」章节写入正式知识网络，并把当前正式内容归档为 v${currentVersion}。失败与未变章节不会覆盖。`,
    };
  })();

  return (
    <WorkspaceShell contentClassName="!overflow-y-auto">
      <div className="mx-auto max-w-[1600px] px-6 py-6 md:px-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium tracking-wide text-[#A06358]">
              知识网络 · 更新审核
            </div>
            <h1 className="mt-1 font-[family-name:var(--font-serif,serif)] text-[26px] font-semibold text-[#1F2423]">
              {rows.length === 1
                ? `审核「${rows[0]!.label}」更新草案`
                : "审核章节更新草案"}
            </h1>
            <p className="mt-1.5 text-[13px] text-[#59625F]">
              对照当前正式版 v{currentVersion}（基于生成时 v{baseVersion}
              ）与待审核草案；确认差异后再发布，正式内容不会在生成时被覆盖。
            </p>
          </div>
          <Link
            to={`/app/projects/${projectId}/knowledge`}
            className="text-[13px] font-medium text-[#A06358] hover:underline"
          >
            返回知识网络
          </Link>
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
          <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_240px]">
            <aside className="overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.9)]">
              <div className="border-b border-[rgba(78,66,57,0.1)] px-3.5 py-3 text-[12px] font-semibold text-[#59625F]">
                章节列表
              </div>
              <ul className="max-h-[min(70vh,760px)] overflow-auto p-1.5">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => selectSection(r.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors",
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
                  </li>
                ))}
              </ul>
            </aside>

            <main className="overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.85)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(78,66,57,0.1)] px-4 py-3">
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

              {showReviseBar ? (
                <div className="flex flex-wrap items-end gap-2 border-b border-[rgba(78,66,57,0.08)] px-4 py-3">
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
                  <div className="space-y-3">
                    <div className="rounded-xl border border-[rgba(176,125,31,0.28)] bg-[rgba(176,125,31,0.08)] px-4 py-3">
                      <p className="text-[13px] font-medium text-[#8A6218]">
                        正在按指令改写草案…
                      </p>
                      {selected.error?.trim() ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] text-[#59625F]">
                          指令：{selected.error}
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-[12px] text-[#969E9A]">
                        刷新页面后仍会显示此状态，完成后自动更新。
                      </p>
                    </div>
                    {selected.draftHtml?.trim() ? (
                      <div className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/70 p-3">
                        <div className="mb-2 text-[12px] font-semibold text-[#59625F]">
                          改写前草案（只读）
                        </div>
                        <div
                          className={HTML_PANE}
                          dangerouslySetInnerHTML={{
                            __html: selected.draftHtml,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : mode === "side" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/70">
                      <div className="border-b border-[rgba(78,66,57,0.08)] px-3 py-2 text-[12px] font-semibold text-[#59625F]">
                        当前 v{currentVersion}
                      </div>
                      <div className="p-3">
                        {selected.liveHtml?.trim() ? (
                          <div
                            className={HTML_PANE}
                            dangerouslySetInnerHTML={{
                              __html: selected.liveHtml,
                            }}
                          />
                        ) : (
                          <p className="text-[12.5px] text-[#969E9A]">
                            （当前无正式内容）
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[rgba(160,99,88,0.18)] bg-white/70">
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
                              editing &&
                                "outline outline-2 outline-[rgba(160,99,88,0.25)] outline-offset-2 rounded-md",
                            )}
                            {...(editing
                              ? {}
                              : {
                                  dangerouslySetInnerHTML: {
                                    __html: selected.draftHtml ?? "",
                                  },
                                })}
                          />
                        ) : (
                          <p className="text-[12.5px] text-[#969E9A]">
                            （草案为空）
                          </p>
                        )}
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

            <aside className="overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.9)] p-4">
              <div className="text-[12px] font-semibold text-[#59625F]">摘要</div>
              <dl className="mt-3 space-y-2 text-[13px] text-[#1F2423]">
                <div className="flex justify-between gap-2">
                  <dt className="text-[#59625F]">待发布变更</dt>
                  <dd className="font-semibold">{changedCount}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#59625F]">失败章节</dt>
                  <dd className="font-semibold text-[#A06358]">{failedCount}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#59625F]">基于版本</dt>
                  <dd className="font-semibold">v{baseVersion}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#59625F]">下次发布</dt>
                  <dd className="font-semibold">v{nextVersion}</dd>
                </div>
              </dl>

              {hasGraphDraft && selected?.id === "project-overview" ? (
                <p className="mt-3 rounded-lg border border-[rgba(94,155,117,0.25)] bg-[rgba(94,155,117,0.08)] px-2.5 py-2 text-[12px] leading-relaxed text-[#2F6B4F]">
                  草案含关系图更新；发布本章时将一并写入正式版。
                </p>
              ) : null}

              {!canPublish ? (
                <p className="mt-4 text-[12px] leading-relaxed text-[#969E9A]">
                  当前角色无权发布或放弃草案。
                </p>
              ) : null}

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
              <button
                type="button"
                disabled={
                  !canPublish ||
                  actionLocked ||
                  editing ||
                  runStatus === "published"
                }
                onClick={() => void onDiscard()}
                className="mt-2.5 flex h-10 w-full items-center justify-center rounded-[11px] border border-[rgba(78,66,57,0.18)] text-[13.5px] font-medium text-[#1F2423] hover:bg-[rgba(78,66,57,0.04)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy === "discard" ? "处理中…" : "放弃草案"}
              </button>
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
