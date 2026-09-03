import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DraftProgressDock } from "@/components/workspace/KnowledgeDraftGeneratingDialog";
import { useDraftProgressUi } from "@/components/workspace/draft-progress-ui";
import {
  isWatchedDraftRun,
  unwatchDraftRun,
  watchDraftRun,
} from "@/lib/draft-progress-watch";
import {
  listMyChapterDraftRuns,
  type MyChapterDraftRunItem,
} from "@/lib/project-api";
import { loadSessionUserId } from "@/workspace/session";

const POLL_MS = 3000;

function toProgress(item: MyChapterDraftRunItem) {
  const generating = item.status === "generating";
  const created = Date.parse(item.createdAt);
  return {
    done: item.progressDone,
    total: item.progressTotal || 1,
    failed: item.failedCount,
    elapsedMs: Number.isFinite(created) ? Math.max(0, Date.now() - created) : 0,
    phase: generating ? ("generating" as const) : ("done" as const),
  };
}

function pickDockItem(items: MyChapterDraftRunItem[]): MyChapterDraftRunItem | null {
  const generating = items.filter((i) => i.status === "generating");
  for (const row of generating) watchDraftRun(row.runId);
  const readyWatched = items.filter(
    (i) => i.status === "ready" && isWatchedDraftRun(i.runId),
  );
  const pool = [...generating, ...readyWatched];
  if (pool.length === 0) return null;
  return pool.sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )[0]!;
}

export function GlobalDraftProgressDock() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const userId = loadSessionUserId() ?? "";
  const { openDialogRunId } = useDraftProgressUi();
  const [item, setItem] = useState<MyChapterDraftRunItem | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const rows = await listMyChapterDraftRuns(userId);
        if (cancelled) return;
        setItem(pickDockItem(rows));
      } catch {
        if (!cancelled) setItem(null);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [userId]);

  if (!item) return null;
  if (openDialogRunId === item.runId) return null;
  if (pathname.includes(`/knowledge/review/${item.runId}`)) return null;

  const onProjectPage = pathname.startsWith(`/app/projects/${item.projectId}`);
  if (item.status !== "generating" && onProjectPage) return null;

  return (
    <DraftProgressDock
      progress={toProgress(item)}
      projectName={onProjectPage ? undefined : item.projectName}
      onOpen={() => {
        if (item.status === "generating") {
          navigate(`/app/projects/${item.projectId}/knowledge`, {
            state: { openDraftProgress: true, draftRunId: item.runId },
          });
          return;
        }
        unwatchDraftRun(item.runId);
        navigate(
          `/app/projects/${item.projectId}/knowledge/review/${item.runId}`,
        );
      }}
    />
  );
}
