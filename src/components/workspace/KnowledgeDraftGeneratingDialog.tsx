import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type DraftGeneratingProgress = {
  done: number;
  total: number;
  failed: number;
  lastLabel?: string;
  elapsedMs: number;
  phase: "creating" | "generating" | "done";
  failedDetails?: string[];
};

type KnowledgeDraftGeneratingDialogProps = {
  open: boolean;
  progress: DraftGeneratingProgress | null;
  runId: string | null;
  error?: string | null;
  /** full = 全部章节；section = 单章 */
  mode?: "full" | "section";
  sectionLabel?: string;
  stopping?: boolean;
  onClose: () => void;
  onGoReview: () => void;
  onStop?: () => void;
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

export function KnowledgeDraftGeneratingDialog({
  open,
  progress,
  runId,
  error,
  mode = "full",
  sectionLabel,
  stopping = false,
  onClose,
  onGoReview,
  onStop,
}: KnowledgeDraftGeneratingDialogProps) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  if (!mounted && !open) return null;
  if (!open) return null;

  const done = progress?.done ?? 0;
  const total = progress?.total ?? (mode === "section" ? 1 : 13);
  const failed = progress?.failed ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const finished = progress?.phase === "done";
  const canReview = finished && Boolean(runId) && done - failed > 0;
  const chapterName = sectionLabel?.trim() || "本章";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kn-draft-dialog-title"
    >
      <div className="relative w-full max-w-[520px] overflow-hidden rounded-[16px] border border-[rgba(78,66,57,0.12)] bg-[hsl(var(--paper))] shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#59625F] hover:bg-[rgba(78,66,57,0.06)]"
          aria-label="关闭"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        <div className="px-7 pb-6 pt-7">
          <div className="text-[11px] font-medium tracking-wide text-[#A06358]">
            生成知识网络更新草案
          </div>
          <h2
            id="kn-draft-dialog-title"
            className="mt-2 font-[family-name:var(--font-serif,serif)] text-[22px] font-semibold leading-snug text-[#1F2423]"
          >
            {finished
              ? "草案已准备就绪"
              : mode === "section"
                ? `正在准备「${chapterName}」更新`
                : "正在准备全部章节更新"}
          </h2>
          <p className="mt-2.5 text-[13px] leading-[1.7] text-[#59625F]">
            {mode === "section" ? (
              <>
                正在生成「{chapterName}」的待审核草案。
                <span className="font-medium text-[#1F2423]">
                  当前正式版本不会被覆盖
                </span>
                ；完成后可进入审核页对照差异，确认后再发布。点「后台继续」可关闭本窗口，生成仍会继续。
              </>
            ) : (
              <>
                正在生成 13 个研究章节的待审核草案。
                <span className="font-medium text-[#1F2423]">
                  当前正式版本不会被覆盖
                </span>
                ；全部完成后可进入审核页对照差异并发布为新版本。点「后台继续」可关闭本窗口，生成仍会继续。
              </>
            )}
          </p>

          <div className="mt-5 rounded-[12px] border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.9)] px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
              <span className="font-medium text-[#1F2423]">
                {progress?.phase === "creating"
                  ? "正在创建草案…"
                  : `进度 ${done}/${total}`}
                {progress?.lastLabel ? ` · ${progress.lastLabel}` : ""}
                {progress
                  ? ` · 已用时 ${formatElapsedMs(progress.elapsedMs)}`
                  : ""}
              </span>
              {failed > 0 ? (
                <span className="text-[#A06358]">失败 {failed}</span>
              ) : (
                <span className="text-[#59625F]">
                  {finished
                    ? "已完成"
                    : "生成中"}
                </span>
              )}
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[rgba(78,66,57,0.1)]">
              <div
                className={cn(
                  "h-full transition-[width] duration-300",
                  finished ? "bg-[#2F6B4F]" : "bg-[#A06358]",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {error || (progress?.failedDetails && progress.failedDetails.length > 0) ? (
            <div className="mt-3 rounded-xl border border-[rgba(160,99,88,0.25)] bg-[rgba(160,99,88,0.06)] px-3.5 py-2 text-[12.5px] text-[#A06358]">
              {error ? <p>{error}</p> : null}
              {progress?.failedDetails && progress.failedDetails.length > 0 ? (
                <ul className={error ? "mt-1.5 list-disc space-y-0.5 pl-4" : "list-disc space-y-0.5 pl-4"}>
                  {progress.failedDetails.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-2.5">
            {!finished && onStop ? (
              <button
                type="button"
                onClick={onStop}
                disabled={stopping || !runId}
                className="inline-flex h-10 items-center rounded-[11px] border border-[rgba(160,99,88,0.28)] bg-transparent px-4 text-[13.5px] font-medium text-[#A06358] hover:bg-[rgba(160,99,88,0.06)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {stopping ? "正在停止…" : "停止生成"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-[11px] border border-[rgba(78,66,57,0.18)] bg-transparent px-4 text-[13.5px] font-medium text-[#1F2423] hover:bg-[rgba(78,66,57,0.04)]"
            >
              {finished ? "稍后处理" : "后台继续"}
            </button>
            <button
              type="button"
              onClick={onGoReview}
              disabled={!canReview}
              className="inline-flex h-10 items-center rounded-[11px] bg-[#A06358] px-4 text-[13.5px] font-medium text-white hover:bg-[#8F564C] disabled:cursor-not-allowed disabled:opacity-45"
            >
              前往审核
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
