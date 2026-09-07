import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Folder, Loader2, Upload, X } from "lucide-react";
import {
  collectDroppedFiles,
  isLikelyDirectoryPlaceholder,
  shouldSkipDroppedPath,
  snapshotDroppedEntries,
} from "@/lib/collect-dropped-files";
import { cn } from "@/lib/utils";

export type CreateUploadProgress =
  | { phase: "creating" }
  | { phase: "uploading"; index: number; total: number; name: string };

function fileKey(file: File): string {
  const rel =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
  return `${rel || file.name}-${file.size}-${file.lastModified}`;
}

function fileLabel(file: File): string {
  const rel =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
  return rel.includes("/") ? rel : file.name;
}

function formatFileSize(bytes: number): string {
  const n = Number(bytes) || 0;
  if (n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function filterPickedFiles(files: FileList | File[] | null): File[] {
  if (!files || files.length === 0) return [];
  return Array.from(files).filter((file) => {
    if (isLikelyDirectoryPlaceholder(file)) return false;
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ??
      file.name;
    return !shouldSkipDroppedPath(rel);
  });
}

export function mergeUniqueFiles(prev: File[], incoming: File[]): File[] {
  const seen = new Set(prev.map(fileKey));
  const merged = [...prev];
  for (const file of incoming) {
    const key = fileKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(file);
  }
  return merged;
}

const hiddenPickerClass =
  "pointer-events-none fixed left-0 top-0 z-[400] h-px w-px opacity-[0.01]";

export function CreateProjectAttachments({
  files,
  onChange,
  disabled,
  uploadProgress,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  uploadProgress?: CreateUploadProgress | null;
}) {
  const reactId = useId();
  const fileInputId = `${reactId}-files`;
  const folderInputId = `${reactId}-folder`;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const awaitingPickerRef = useRef<"file" | "folder" | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [readingDrop, setReadingDrop] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const bindFolderInput = useCallback((el: HTMLInputElement | null) => {
    folderInputRef.current = el;
    if (!el) return;
    el.setAttribute("webkitdirectory", "");
    el.setAttribute("directory", "");
  }, []);

  const filesRef = useRef(files);
  filesRef.current = files;

  const applyIncoming = useCallback(
    (incoming: FileList | File[] | null, emptyMessage: string) => {
      const picked = filterPickedFiles(incoming);
      if (picked.length === 0) {
        setStatusText(emptyMessage);
        return;
      }
      const next = mergeUniqueFiles(filesRef.current, picked);
      const added = next.length - filesRef.current.length;
      if (added <= 0) {
        setStatusText("这些文件已经在列表里了。");
        return;
      }
      onChange(next);
      const totalSize = picked.reduce((sum, file) => sum + file.size, 0);
      setStatusText(
        `已加入 ${added} 个文件（${formatFileSize(totalSize)}）。点「确定」创建项目时开始上传，可看进度。`,
      );
    },
    [onChange],
  );

  const onPickerChange = (list: FileList | null) => {
    awaitingPickerRef.current = null;
    applyIncoming(list, "未选到可用文件。可再点选择，或把文件拖进虚线框。");
  };

  useEffect(() => {
    const onFocus = () => {
      window.setTimeout(() => {
        if (!awaitingPickerRef.current) return;
        awaitingPickerRef.current = null;
        setStatusText((prev) =>
          prev?.startsWith("请在弹出")
            ? files.length > 0
              ? "没有加入新文件。"
              : "没有选到文件。可再点选择，或把文件拖进虚线框。"
            : prev,
        );
      }, 280);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [files.length]);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const uploading =
    uploadProgress?.phase === "uploading" ? uploadProgress : null;

  return (
    <div>
      {createPortal(
        <>
          <input
            id={fileInputId}
            ref={fileInputRef}
            type="file"
            className={hiddenPickerClass}
            multiple
            tabIndex={-1}
            disabled={disabled}
            onChange={(e) => {
              onPickerChange(e.target.files);
              e.currentTarget.value = "";
            }}
          />
          <input
            id={folderInputId}
            ref={bindFolderInput}
            type="file"
            className={hiddenPickerClass}
            multiple
            tabIndex={-1}
            disabled={disabled}
            onChange={(e) => {
              onPickerChange(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </>,
        document.body,
      )}

      <span className="mb-1 block text-xs font-medium text-[hsl(var(--warm-charcoal))]">
        参考附件
      </span>
      <div
        className={cn(
          "rounded-lg border border-dashed p-2.5 transition",
          dragOver
            ? "border-[hsl(var(--wine-deep)/0.55)] bg-[hsl(var(--linen)/0.85)]"
            : "border-[hsl(var(--sand))] bg-[hsl(var(--linen)/0.4)]",
          disabled && "pointer-events-none opacity-70",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const snap = snapshotDroppedEntries(e.dataTransfer);
          setReadingDrop(true);
          setStatusText("正在读取拖入的文件…");
          void collectDroppedFiles(snap)
            .then((dropped) => {
              applyIncoming(
                dropped,
                "未读到可用文件。请改用「选择文件夹」，或把文件夹里的文件拖进来。",
              );
            })
            .catch(() => {
              setStatusText(
                "未能读取拖入的文件夹。请改用「选择文件夹」，或把文件夹里的文件拖进来。",
              );
            })
            .finally(() => setReadingDrop(false));
        }}
      >
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={fileInputId}
            onPointerDown={() => {
              if (disabled) return;
              awaitingPickerRef.current = "file";
              setStatusText("请在弹出的窗口里选择文件…");
            }}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[hsl(var(--sand)/0.9)] bg-white px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--warm-charcoal))] transition hover:border-[hsl(var(--wine-deep)/0.35)]",
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <Upload className="h-3.5 w-3.5 text-[hsl(var(--wine-deep))]" />
            选择文件
          </label>
          <label
            htmlFor={folderInputId}
            onPointerDown={() => {
              if (disabled) return;
              awaitingPickerRef.current = "folder";
              setStatusText("请在弹出的窗口里选择文件夹…");
            }}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[hsl(var(--sand)/0.9)] bg-white px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--warm-charcoal))] transition hover:border-[hsl(var(--wine-deep)/0.35)]",
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <Folder className="h-3.5 w-3.5 text-[hsl(var(--wine-deep))]" />
            选择文件夹
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          {readingDrop ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在读取拖入的文件…
            </span>
          ) : uploading ? (
            <span className="inline-flex items-center gap-1.5 text-[hsl(var(--wine-deep))]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在上传 {uploading.index}/{uploading.total}：{uploading.name}
            </span>
          ) : statusText ? (
            statusText
          ) : files.length > 0 ? (
            `已选择 ${files.length} 个文件（${formatFileSize(totalBytes)}），点「确定」后开始上传`
          ) : (
            "尚未选择附件。选好后点「确定」才会上传，上传时会显示进度。"
          )}
        </p>
        {uploading ? (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[hsl(var(--sand)/0.7)]">
            <div
              className="h-full rounded-full bg-[hsl(var(--wine-deep))] transition-[width] duration-200"
              style={{
                width: `${Math.max(6, (uploading.index / uploading.total) * 100)}%`,
              }}
            />
          </div>
        ) : null}
        {files.length > 0 ? (
          <ul className="mt-2 max-h-28 space-y-1.5 overflow-y-auto pr-0.5">
            {files.map((file, idx) => {
              const label = fileLabel(file);
            const isCurrent = Boolean(uploading && idx === uploading.index - 1);
            return (
                <li
                  key={`${fileKey(file)}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/65 bg-white px-3 py-2 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {isCurrent ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[hsl(var(--wine-deep))]" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0 text-primary/80" />
                    )}
                    <span className="truncate" title={label}>
                      {label}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {isCurrent ? "上传中" : formatFileSize(file.size)}
                    </span>
                  </span>
                  {disabled ? null : (
                    <button
                      type="button"
                      onClick={() =>
                        onChange(files.filter((_, i) => i !== idx))
                      }
                      className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="移除附件"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
