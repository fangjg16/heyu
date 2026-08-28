import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus } from "lucide-react";
import { AnnotationMode, GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { cn } from "@/lib/utils";
import { fitPdfScale } from "@/lib/pdf-fit-scale";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

type PdfLinkHotspot = {
  href: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

function externalAnnotationUrl(annotation: {
  subtype?: string;
  url?: string;
  unsafeUrl?: string;
}): string | null {
  const href = String(annotation.url || annotation.unsafeUrl || "").trim();
  if (!/^https?:\/\//i.test(href)) return null;
  if (annotation.subtype && annotation.subtype !== "Link") return null;
  return href;
}

async function collectPageLinkHotspots(
  pdfPage: PDFPageProxy,
  viewport: { convertToViewportPoint: (x: number, y: number) => number[] },
): Promise<PdfLinkHotspot[]> {
  let annotations: Array<{
    subtype?: string;
    url?: string;
    unsafeUrl?: string;
    rect?: number[];
  }> = [];
  try {
    annotations = (await pdfPage.getAnnotations({ intent: "display" })) as typeof annotations;
  } catch {
    return [];
  }
  const out: PdfLinkHotspot[] = [];
  for (const annotation of annotations) {
    const href = externalAnnotationUrl(annotation);
    if (!href || !annotation.rect || annotation.rect.length < 4) continue;
    const [x1, y1, x2, y2] = annotation.rect;
    const a = viewport.convertToViewportPoint(x1!, y1!);
    const b = viewport.convertToViewportPoint(x2!, y2!);
    const left = Math.min(a[0]!, b[0]!);
    const top = Math.min(a[1]!, b[1]!);
    const width = Math.abs(b[0]! - a[0]!);
    const height = Math.abs(b[1]! - a[1]!);
    if (width < 2 || height < 2) continue;
    out.push({ href, left, top, width, height });
  }
  return out;
}

export function PdfCanvasPreview({
  url,
  httpHeaders,
}: {
  url: string;
  httpHeaders?: Record<string, string>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [userZoom, setUserZoom] = useState(1);
  const [pageSize, setPageSize] = useState({ width: 1, height: 1 });
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<PdfLinkHotspot[]>([]);
  const [display, setDisplay] = useState({ width: 1, height: 1 });
  const headerKey = httpHeaders ? JSON.stringify(httpHeaders) : "";

  const renderScale =
    boxSize.width > 0
      ? fitPdfScale(pageSize.width, pageSize.height, boxSize.width, boxSize.height) *
        userZoom
      : 1;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdf(null);
    setPage(1);
    setUserZoom(1);
    setLinks([]);
    const headers = headerKey
      ? (JSON.parse(headerKey) as Record<string, string>)
      : undefined;
    const task = getDocument({
      url,
      httpHeaders: headers,
      withCredentials: false,
      disableRange: false,
      disableStream: false,
      disableAutoFetch: true,
    });
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
  }, [url, headerKey]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const apply = () => {
      setBoxSize({ width: el.clientWidth, height: el.clientHeight });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    void pdf.getPage(page).then((pdfPage) => {
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: 1 });
      setPageSize({ width: viewport.width, height: viewport.height });
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, page]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || boxSize.width <= 0) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    const run = async () => {
      renderTaskRef.current?.cancel();
      const pdfPage = await pdf.getPage(page);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: renderScale });
      const outputScale = window.devicePixelRatio || 1;
      const cssW = Math.floor(viewport.width);
      const cssH = Math.floor(viewport.height);
      canvas.width = Math.floor(cssW * outputScale);
      canvas.height = Math.floor(cssH * outputScale);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      setDisplay({ width: cssW, height: cssH });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const transform =
        outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      const task = pdfPage.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform,
        annotationMode: AnnotationMode.DISABLE,
        intent: "display",
      });
      renderTaskRef.current = task;
      try {
        await task.promise;
        if (cancelled) return;
        const hotspots = await collectPageLinkHotspots(pdfPage, viewport);
        if (!cancelled) setLinks(hotspots);
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
  }, [pdf, page, renderScale, boxSize.width]);

  const zoomLabel = `${Math.round(userZoom * 100)}%`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
          disabled={userZoom <= MIN_ZOOM + 0.001}
          aria-label="缩小"
          onClick={() => setUserZoom((s) => Math.max(MIN_ZOOM, +(s - ZOOM_STEP).toFixed(2)))}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[3.2rem] text-center tabular-nums text-[hsl(var(--warm-charcoal-muted))]">
          {zoomLabel}
        </span>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[rgba(78,66,57,0.06)] disabled:opacity-30"
          disabled={userZoom >= MAX_ZOOM - 0.001}
          aria-label="放大"
          onClick={() => setUserZoom((s) => Math.min(MAX_ZOOM, +(s + ZOOM_STEP).toFixed(2)))}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={scrollerRef}
        className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-[rgba(248,243,238,0.55)] [scrollbar-gutter:stable]"
        onContextMenu={(e) => e.preventDefault()}
      >
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载预览…
          </div>
        ) : null}
        {error ? (
          <div className="m-4 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <div
          className={cn(
            "flex min-h-full min-w-full items-center justify-center p-7",
            (loading || error) && "hidden",
          )}
        >
          <div
            className="relative shrink-0"
            style={{ width: display.width, height: display.height }}
          >
            <canvas
              ref={canvasRef}
              className="block rounded-md bg-white shadow-[0_8px_28px_rgba(78,66,57,0.14)]"
            />
            <div className="absolute inset-0">
              {links.map((link, i) => (
                <a
                  key={`${link.href}-${i}`}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.href}
                  aria-label="在新窗口打开链接"
                  className="absolute z-10 cursor-pointer rounded-sm hover:bg-[hsl(var(--wine)/0.12)]"
                  style={{
                    left: `${(link.left / display.width) * 100}%`,
                    top: `${(link.top / display.height) * 100}%`,
                    width: `${(link.width / display.width) * 100}%`,
                    height: `${(link.height / display.height) * 100}%`,
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(link.href, "_blank", "noopener,noreferrer");
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
