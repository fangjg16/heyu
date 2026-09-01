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
  /** 沿用草案后指定重跑范围 */
  regen?: "unpublished" | "all-drafts" | null;
  sectionLabel?: string;
  /** 沿用了未发布草案，并未从头再生成 */
  reused?: boolean;
  stopping?: boolean;
  onClose: () => void;
  onGoReview: () => void;
  onStop?: () => void;
};

export const DISCARD_THEN_REGENERATE_HINT =
  "要整份重来，请先放弃当前草案。";

function formatElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}小时${m}分${s}秒`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

function finishedTitle(opts: {
  failed: number;
  done: number;
  reused: boolean;
}): string {
  const { failed, done, reused } = opts;
  if (failed > 0 && done - failed <= 0) return "草案生成失败";
  if (failed > 0) return "草案部分就绪";
  if (reused) return "沿用了待审核草案";
  return "草案已准备就绪";
}

function runningTitle(opts: {
  mode: "full" | "section";
  chapterName: string;
  regen?: "unpublished" | "all-drafts" | null;
}): string {
  if (opts.mode === "section") return `正在准备「${opts.chapterName}」更新`;
  if (opts.regen === "unpublished") return "正在更新未发布草案";
  if (opts.regen === "all-drafts") return "正在更新全部草案";
  return "正在准备全部章节更新";
}

function runningBody(opts: {
  mode: "full" | "section";
  chapterName: string;
  regen?: "unpublished" | "all-drafts" | null;
}): string {
  if (opts.mode === "section") {
    return `正在生成「${opts.chapterName}」。可关闭此窗口，完成后在审核页查看。`;
  }
  if (opts.regen === "unpublished") {
    return "正在生成未发布章节对应的资料文件和知识网络草案。已发布的正式章不会改。可关闭此窗口，完成后在审核页查看。";
  }
  if (opts.regen === "all-drafts") {
    return "正在先重写资料包总文件，再生成全部章节草案。已发布的正式章在发布前不会改变。可关闭此窗口，完成后在审核页查看。";
  }
  return "正在先把研究总文件写入项目资料包，再生成知识网络章节；研究章完成后会再生成项目概览草案。可关闭此窗口，完成后在审核页查看。";
}

function finishedBody(opts: {
  failed: number;
  done: number;
  total: number;
  reused: boolean;
  mode: "full" | "section";
  chapterName: string;
  regen?: "unpublished" | "all-drafts" | null;
}): string {
  const { failed, done, total, reused, mode, chapterName, regen } = opts;
  if (failed > 0 && done - failed > 0) {
    return `已完成 ${done - failed}/${total} 项（含资料文件与章节），${failed} 项失败。可去审核；再点「更新全部」会重试失败项。`;
  }
  if (failed > 0) {
    return mode === "section"
      ? `「${chapterName}」生成失败，可关闭后重试。`
      : "章节生成失败。可关闭后重试。";
  }
  if (reused) {
    return mode === "section"
      ? `「${chapterName}」已有待审核草案，未重新生成。要重来，请先放弃草案。`
      : `未发布的还在草案里，已发布的正式章也不改。${DISCARD_THEN_REGENERATE_HINT}`;
  }
  if (mode === "section") {
    return `「${chapterName}」已生成，可以去审核。`;
  }
  if (regen === "unpublished") {
    return "未发布章节的草案已生成，可以去审核。已发布的正式章未改。";
  }
  if (regen === "all-drafts") {
    return "全部章节草案已生成，可以去审核。已发布的正式章在发布前不会改变。";
  }
  return "全部章节（含项目概览草案）已生成，可以去审核。";
}

export function KnowledgeDraftGeneratingDialog({
  open,
  progress,
  runId,
  error,
  mode = "full",
  regen = null,
  sectionLabel,
  reused = false,
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
            生成更新
          </div>
          <h2
            id="kn-draft-dialog-title"
            className="mt-2 font-[family-name:var(--font-serif,serif)] text-[22px] font-semibold leading-snug text-[#1F2423]"
          >
            {finished
              ? finishedTitle({ failed, done, reused })
              : runningTitle({ mode, chapterName, regen })}
          </h2>
          <p className="mt-2.5 text-[13px] leading-[1.7] text-[#59625F]">
            {finished
              ? finishedBody({
                  failed,
                  done,
                  total,
                  reused,
                  mode,
                  chapterName,
                  regen,
                })
              : runningBody({ mode, chapterName, regen })}
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
                  {finished ? (reused ? "已沿用" : "已完成") : "生成中"}
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
              {finished ? "关闭" : "后台进行"}
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
