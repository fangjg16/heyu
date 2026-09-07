import { useCallback, useEffect, useRef, useState } from "react";
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

const FILE_INPUT_ID = "heyu-create-project-files";
const FOLDER_INPUT_ID = "heyu-create-project-folder";

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

function keepUserFile(file: File): boolean {
  const rel =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ??
    file.name;
  return !shouldSkipDroppedPath(rel);
}

function snapshotPickerFiles(list: FileList | null): File[] {
  if (!list || list.length === 0) return [];
  return Array.from(list)
    .map((file) => {
      const rel =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ??
        "";
      const copy = new File([file], file.name, {
        type: file.type,
        lastModified: file.lastModified,
      });
      if (rel) {
        Object.defineProperty(copy, "webkitRelativePath", {
          value: rel,
          configurable: true,
        });
      }
      return copy;
    })
    .filter(keepUserFile);
}

function filterDroppedFiles(files: FileList | File[] | null): File[] {
  if (!files || files.length === 0) return [];
  return Array.from(files).filter((file) => {
    if (isLikelyDirectoryPlaceholder(file)) return false;
    return keepUserFile(file);
  });
}

function mergeUniqueFiles(prev: File[], incoming: File[]): File[] {
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

/** 盖在按钮上给用户点；不能 hidden/sr-only，否则点「打开」后文件列表是空的。 */
const overlayPickerClass =
  "absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0";

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
  const filesRef = useRef(files);
  filesRef.current = files;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [joining, setJoining] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const applyIncoming = useCallback(
    (incoming: File[], emptyMessage: string) => {
      if (incoming.length === 0) {
        setStatusText(emptyMessage);
        return;
      }
      const next = mergeUniqueFiles(filesRef.current, incoming);
      const added = next.length - filesRef.current.length;
      if (added <= 0) {
        setStatusText("这些文件已经在列表里了。");
        return;
      }
      onChange(next);
      const totalSize = incoming.reduce((sum, file) => sum + file.size, 0);
      setStatusText(
        `已加入 ${added} 个文件（${formatFileSize(totalSize)}）。点「确定」创建项目时开始上传，那时会显示进度。`,
      );
    },
    [onChange],
  );

  useEffect(() => {
    const folderEl = folderInputRef.current;
    folderEl?.setAttribute("webkitdirectory", "");
    folderEl?.setAttribute("directory", "");
    const handler = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (
        !target ||
        (target.id !== FILE_INPUT_ID && target.id !== FOLDER_INPUT_ID)
      ) {
        return;
      }
      const snapshot = snapshotPickerFiles(target.files);
      if (snapshot.length === 0) return;
      target.value = "";
      setJoining(true);
      setStatusText("正在加入所选文件…");
      applyIncoming(
        snapshot,
        "没有收到所选文件。请再试一次，或把文件拖进虚线框。",
      );
      window.setTimeout(() => setJoining(false), 280);
    };
    document.addEventListener("change", handler, true);
    return () => document.removeEventListener("change", handler, true);
  }, [applyIncoming]);

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const uploading =
    uploadProgress?.phase === "uploading" ? uploadProgress : null;

  return (
    <div>
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
          setJoining(true);
          setStatusText("正在读取拖入的文件…");
          void collectDroppedFiles(snap)
            .then((dropped) => {
              applyIncoming(
                filterDroppedFiles(dropped),
                "未读到可用文件。请改用「选择文件夹」，或把文件夹里的文件拖进来。",
              );
            })
            .catch(() => {
              setStatusText(
                "未能读取拖入的文件夹。请改用「选择文件夹」，或把文件夹里的文件拖进来。",
              );
            })
            .finally(() => setJoining(false));
        }}
      >
        <div className="flex flex-wrap gap-2">
          <span
            className={cn(
              "relative inline-flex items-center gap-1.5 overflow-hidden rounded-md border border-[hsl(var(--sand)/0.9)] bg-white px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--warm-charcoal))] transition hover:border-[hsl(var(--wine-deep)/0.35)]",
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <Upload className="h-3.5 w-3.5 text-[hsl(var(--wine-deep))]" />
            选择文件
            <input
              id={FILE_INPUT_ID}
              ref={fileInputRef}
              type="file"
              className={overlayPickerClass}
              multiple
              disabled={disabled}
            />
          </span>
          <span
            className={cn(
              "relative inline-flex items-center gap-1.5 overflow-hidden rounded-md border border-[hsl(var(--sand)/0.9)] bg-white px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--warm-charcoal))] transition hover:border-[hsl(var(--wine-deep)/0.35)]",
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <Folder className="h-3.5 w-3.5 text-[hsl(var(--wine-deep))]" />
            选择文件夹
            <input
              id={FOLDER_INPUT_ID}
              ref={folderInputRef}
              type="file"
              className={overlayPickerClass}
              multiple
              disabled={disabled}
            />
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          {joining ? (
            <span className="inline-flex items-center gap-1.5 text-[hsl(var(--wine-deep))]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {statusText ?? "正在加入所选文件…"}
            </span>
          ) : uploading ? (
            <span className="inline-flex items-center gap-1.5 text-[hsl(var(--wine-deep))]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在上传 {uploading.index}/{uploading.total}：{uploading.name}
            </span>
          ) : statusText ? (
            statusText
          ) : files.length > 0 ? (
            `已选择 ${files.length} 个文件（${formatFileSize(totalBytes)}）。点「确定」后开始上传。`
          ) : (
            "选好文件并点「打开」后会出现在下方。点「确定」创建项目时才上传，那时会显示进度。"
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
              const isCurrent = Boolean(
                uploading && idx === uploading.index - 1,
              );
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
