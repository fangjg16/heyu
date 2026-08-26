import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus } from "lucide-react";
import { AnnotationMode, GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { cn } from "@/lib/utils";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.4;
const SCALE_STEP = 0.15;

export function PdfCanvasPreview({ data }: { data: ArrayBuffer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdf(null);
    setPage(1);
    const copy = new Uint8Array(data.slice(0));
    const task = getDocument({ data: copy, disableAutoFetch: false });
    task.promise
      .then((doc) => {
        if (cancelled) {
          void doc.cleanup();
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "无法打开 PDF");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      void task.destroy();
    };
  }, [data]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    const run = async () => {
      renderTaskRef.current?.cancel();
      const pdfPage = await pdf.getPage(page);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const task = pdfPage.render({
        canvas,
        canvasContext: ctx,
        viewport,
        annotationMode: AnnotationMode.DISABLE,
        intent: "display",
      });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (e) {
        if ((e as { name?: string })?.name === "RenderingCancelledException") return;
        if (!cancelled) setError(e instanceof Error ? e.message : "页面渲染失败");
      }
    };
    void run();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdf, page, scale]);

  const zoomLabel = `${Math.round(scale * 100)}%`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-center gap-2 border-b border-[rgba(78,66,57,0.08)] text-[12px] text-[hsl(var(--warm-charcoal))]">
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[rgba(78,66,57,0.06)] disabled:opacity-30"
          disabled={page <= 1}
          aria-label="上一页"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tabular-nums text-[hsl(var(--warm-charcoal-muted))]">
          第 {page} / {Math.max(numPages, 1)} 页
        </span>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[rgba(78,66,57,0.06)] disabled:opacity-30"
          disabled={page >= numPages}
          aria-label="下一页"
          onClick={() => setPage((p) => Math.min(numPages, p + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="mx-1 h-3.5 w-px bg-[rgba(78,66,57,0.18)]" />
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[rgba(78,66,57,0.06)] disabled:opacity-30"
          disabled={scale <= MIN_SCALE + 0.001}
          aria-label="缩小"
          onClick={() => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP))}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[3.2rem] text-center tabular-nums text-[hsl(var(--warm-charcoal-muted))]">
          {zoomLabel}
        </span>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[rgba(78,66,57,0.06)] disabled:opacity-30"
          disabled={scale >= MAX_SCALE - 0.001}
          aria-label="放大"
          onClick={() => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP))}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto bg-[rgba(248,243,238,0.45)] p-4"
        onContextMenu={(e) => e.preventDefault()}
      >
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载预览…
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <canvas
          ref={canvasRef}
          className={cn(
            "mx-auto block max-w-full rounded-md bg-white shadow-[0_8px_24px_rgba(78,66,57,0.12)]",
            (loading || error) && "hidden",
          )}
        />
      </div>
    </div>
  );
}
