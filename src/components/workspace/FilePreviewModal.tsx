import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { FolderPlus, Loader2, X } from "lucide-react";
import {
  dismissIfBackdropClick,
  markBackdropPointerDown,
} from "@/lib/backdrop-dismiss";
import { apiFetch } from "@/lib/api-auth";
import {
  projectFileDownloadUrl,
  type ProjectFileRecord,
} from "@/lib/project-api";
import { loadSessionToken } from "@/workspace/session";
import { PdfCanvasPreview } from "@/components/workspace/PdfCanvasPreview";
import { cn } from "@/lib/utils";

export async function downloadFileBlob(
  projectId: string,
  fileId: string,
  userId: string,
  fallbackName?: string,
): Promise<{ blob: Blob; filename: string }> {
  const q = new URLSearchParams({ userId });
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/download?${q}`,
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err || `下载失败（${res.status}）`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const star = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i.exec(cd);
  const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^";]+)/i.exec(cd);
  let filename = fallbackName?.trim() || "download";
  try {
    if (star?.[1]) {
      filename = decodeURIComponent(star[1].trim());
    } else if (plain?.[1] || plain?.[2]) {
      const raw = (plain[1] ?? plain[2] ?? "").trim();
      filename = decodeURIComponent(raw);
    }
  } catch {
    /* 保留 fallback */
  }
  if (!filename.trim()) filename = fallbackName?.trim() || "download";
  return { blob, filename };
}

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isMarkdownFile(file: ProjectFileRecord): boolean {
  const ext = fileExt(file.filename);
  const mime = (file.mime ?? "").toLowerCase();
  return ext === "md" || ext === "markdown" || mime.includes("markdown");
}

function classifyPreviewKind(file: ProjectFileRecord): "pdf" | "text" | "other" {
  const ext = fileExt(file.filename);
  const mime = (file.mime ?? "").toLowerCase();
  if (ext === "pdf" || mime.includes("pdf")) return "pdf";
  if (
    ["txt", "md", "markdown", "html", "htm", "csv", "json", "log"].includes(ext) ||
    mime.startsWith("text/") ||
    mime.includes("markdown")
  ) {
    return "text";
  }
  return "other";
}

function previewFormat(file: ProjectFileRecord): string {
  const ext = fileExt(file.filename);
  if (ext) return ext.toUpperCase();
  if ((file.mime ?? "").includes("pdf")) return "PDF";
  return "FILE";
}

function formatFileDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const FILE_MD_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mb-4 mt-2 font-display text-[26px] font-semibold leading-snug text-[#1F2423] first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-8 border-b border-[rgba(78,66,57,0.12)] pb-2 text-[17px] font-semibold text-[#1F2423]">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-6 text-[15px] font-semibold text-[#1F2423]">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-[14.5px] leading-[1.9] text-[hsl(var(--warm-charcoal))] last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mb-4 list-outside list-disc space-y-1.5 pl-5 text-[14.5px] leading-[1.8] text-[hsl(var(--warm-charcoal))]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 list-outside list-decimal space-y-1.5 pl-5 text-[14.5px] leading-[1.8] text-[hsl(var(--warm-charcoal))]">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-[#1F2423]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-[3px] border-[hsl(var(--wine))]/40 bg-[hsl(var(--wine))]/[0.04] px-4 py-2 text-[14px] leading-relaxed text-[hsl(var(--warm-charcoal))]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-[rgba(78,66,57,0.12)]" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-[hsl(var(--wine))] underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    if (className?.startsWith("language-")) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-[rgba(78,66,57,0.08)] px-1 py-0.5 font-mono text-[12.5px]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-xl bg-[rgba(78,66,57,0.06)] p-4 font-mono text-[12.5px] leading-relaxed text-[#1F2423]">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto rounded-xl border border-[rgba(78,66,57,0.12)]">
      <table className="w-full min-w-[480px] border-collapse text-left text-[13px]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[rgba(78,66,57,0.05)]">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2.5 text-[12px] font-semibold text-[#1F2423]">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-t border-[rgba(78,66,57,0.08)] px-3 py-2.5 align-top leading-snug text-[hsl(var(--warm-charcoal))]">
      {children}
    </td>
  ),
  tr: ({ children }) => <tr className="even:bg-[rgba(78,66,57,0.03)]">{children}</tr>,
};

function FileMarkdownBody({ text }: { text: string }) {
  return (
    <div className="file-md-preview">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={FILE_MD_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function FilePreviewModal({
  projectId,
  userId,
  file,
  versionFiles = [],
  onClose,
  onDownload,
}: {
  projectId: string;
  userId: string;
  file: ProjectFileRecord | null;
  versionFiles?: ProjectFileRecord[];
  onClose: () => void;
  onDownload?: () => Promise<void>;
}) {
  const [viewing, setViewing] = useState<ProjectFileRecord | null>(file);
  const [loading, setLoading] = useState(
    () => !(file && classifyPreviewKind(file) === "pdf"),
  );
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [mode, setMode] = useState<"text" | "pdf" | "other">(() =>
    file && classifyPreviewKind(file) === "pdf" ? "pdf" : "other",
  );
  const pdfHeaders = useMemo(() => {
    const token = loadSessionToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, []);
  const pdfUrl = file
    ? projectFileDownloadUrl(projectId, file.id, userId)
    : "";

  useEffect(() => {
    setViewing(file);
  }, [file]);

  const active = viewing ?? file;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const kind = classifyPreviewKind(active);
    if (kind === "pdf") {
      setMode("pdf");
      setLoading(false);
      setError(null);
      setText(null);
      return;
    }
    const run = async () => {
      setLoading(true);
      setError(null);
      setText(null);
      try {
        const { blob } = await downloadFileBlob(
          projectId,
          active.id,
          userId,
          active.filename,
        );
        if (cancelled) return;
        if (classifyPreviewKind(active) === "text") {
          const raw = await blob.text();
          if (cancelled) return;
          setMode("text");
          setText(raw.length > 200_000 ? `${raw.slice(0, 200_000)}\n\n…（已截断）` : raw);
        } else {
          setMode("other");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [active, projectId, userId]);

  if (!file || !active) return null;
  const format = previewFormat(active);
  const versions = versionFiles.length > 0 ? versionFiles : [active];

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="源文件预览"
      onPointerDown={markBackdropPointerDown}
      onClick={(e) => dismissIfBackdropClick(e, onClose)}
    >
      <div
        className={cn(
          "flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.12)] bg-[hsl(var(--paper))] shadow-2xl",
          mode === "pdf"
            ? "h-full max-h-[62rem] w-full max-w-[76rem]"
            : "max-h-[min(92vh,880px)] w-full max-w-[min(96vw,80rem)]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-[rgba(78,66,57,0.1)] px-4 py-3">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[#EFE7E6] text-[11px] font-bold text-[hsl(var(--wine))]">
            {format}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{active.filename}</div>
            <div className="mt-0.5 text-[11px] text-[hsl(var(--warm-charcoal-muted))]">
              {format} · 只读预览
              {versions.length > 1
                ? ` · ${versions.length} 个历史版本`
                : ""}
            </div>
            {versions.length > 1 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {versions.map((v, i) => {
                  const current = v.id === active.id;
                  const label = v.createdAt
                    ? v.createdAt.replace("T", " ").slice(0, 16)
                    : `版本 ${versions.length - i}`;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setViewing(v)}
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px]",
                        current
                          ? "bg-[#1F2423] text-white"
                          : "bg-[rgba(78,66,57,0.08)] text-[#59625F] hover:bg-[rgba(78,66,57,0.14)]",
                      )}
                    >
                      {i === 0 ? `当前 · ${label}` : label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          {onDownload ? (
            <button
              type="button"
              className="h-8 rounded-lg border border-[rgba(78,66,57,0.14)] px-3 text-xs text-[hsl(var(--warm-charcoal))] hover:bg-[rgba(78,66,57,0.05)]"
              onClick={() => void onDownload()}
            >
              下载
            </button>
          ) : null}
          <button
            type="button"
            aria-label="关闭预览"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgba(78,66,57,0.14)] bg-white text-[hsl(var(--warm-charcoal))] shadow-sm hover:bg-[rgba(78,66,57,0.06)]"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          className={cn(
            "min-h-0 flex-1",
            mode === "pdf" && !error
              ? "flex flex-col overflow-hidden"
              : "overflow-auto bg-[rgba(248,243,238,0.45)] p-5",
          )}
        >
          {loading && mode !== "pdf" ? (
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
          {!loading && !error && mode === "text" ? (
            <div className="mx-auto max-w-[720px] rounded-xl border border-[rgba(78,66,57,0.1)] bg-white px-8 py-10 shadow-sm">
              <div className="flex items-center justify-between gap-4 border-b-2 border-[#1F2423] pb-4">
                <span className="text-[11px] tracking-wide text-[hsl(var(--wine))]">
                  源文件预览
                </span>
                <span className="font-mono text-[10px] text-[#969E9A]">{format}</span>
              </div>
              {isMarkdownFile(active) ? (
                <div className="mt-8">
                  <FileMarkdownBody text={text || ""} />
                </div>
              ) : (
                <>
                  <h1 className="mt-8 font-display text-[28px] font-semibold leading-snug">
                    {file.filename.replace(/\.[^.]+$/, "")}
                  </h1>
                  <div className="mt-2 mb-8 text-xs text-[hsl(var(--warm-charcoal-muted))]">
                    {file.scope === "session" ? "对话上传" : "项目资料包"} ·{" "}
                    {formatFileDate(file.createdAt)}
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-[1.95] text-[hsl(var(--warm-charcoal))]">
                    {text || "—"}
                  </pre>
                </>
              )}
            </div>
          ) : null}
          {mode === "pdf" && pdfUrl && !error ? (
            <PdfCanvasPreview
              url={pdfUrl}
              httpHeaders={pdfHeaders}
            />
          ) : null}
          {!loading && !error && mode === "other" ? (
            <div className="mx-auto max-w-lg rounded-xl border border-[rgba(78,66,57,0.1)] bg-white px-6 py-10 text-center">
              <FolderPlus className="mx-auto h-8 w-8 text-[hsl(var(--warm-charcoal-muted))]" />
              <p className="mt-4 text-sm text-[hsl(var(--warm-charcoal-muted))]">
                {onDownload
                  ? "该类型暂不支持内联预览，请下载后查看。"
                  : "该类型暂不支持内联预览。"}
              </p>
              {onDownload ? (
                <button
                  type="button"
                  className="mt-5 h-10 rounded-[10px] bg-[hsl(var(--wine))] px-5 text-sm font-medium text-white"
                  onClick={() => void onDownload()}
                >
                  下载文件
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
