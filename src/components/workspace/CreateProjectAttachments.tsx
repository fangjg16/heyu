import { useCallback, useEffect, useRef, useState } from "react";
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

function keepUserFile(file: File): string | false {
  const rel =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    file.name;
  return shouldSkipDroppedPath(rel) ? false : rel;
}

function snapshotPickerFiles(list: FileList | null): File[] {
  if (!list || list.length === 0) return [];
  return Array.from(list).filter((file) => keepUserFile(file) !== false);
}

function filterDroppedFiles(files: FileList | File[] | null): File[] {
  if (!files || files.length === 0) return [];
  return Array.from(files).filter((file) => {
    if (isLikelyDirectoryPlaceholder(file)) return false;
    return keepUserFile(file) !== false;
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

/** 挂在 body 上，避开弹窗 overflow；不能 hidden/sr-only，否则点打开后文件列表是空的。 */
const bodyPickerClass =
  "pointer-events-none fixed left-0 top-0 z-[2147483000] h-10 w-56 opacity-[0.01]";

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
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [picked, setPicked] = useState<File[]>(files);

  useEffect(() => {
    setPicked(files);
  }, [files]);

  const applyIncoming = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;
    setPicked((prev) => {
      const base = prev.length ? prev : filesRef.current;
      const next = mergeUniqueFiles(base, incoming);
      if (next.length === base.length) return prev;
      filesRef.current = next;
      queueMicrotask(() => onChangeRef.current(next));
      return next;
    });
  }, []);

  const onInputChange = useCallback(
    (event: Event | { target: EventTarget | null }) => {
      const target = event.target as HTMLInputElement | null;
      if (!target) return;
      applyIncoming(snapshotPickerFiles(target.files));
      window.setTimeout(() => {
        target.value = "";
      }, 0);
    },
    [applyIncoming],
  );
  const onInputChangeRef = useRef(onInputChange);
  onInputChangeRef.current = onInputChange;

  const bindFileInput = useCallback((el: HTMLInputElement | null) => {
    fileInputRef.current = el;
    if (!el) return;
    el.onchange = (event) => onInputChangeRef.current(event);
  }, []);

  const bindFolderInput = useCallback((el: HTMLInputElement | null) => {
    folderInputRef.current = el;
    if (!el) return;
    el.setAttribute("webkitdirectory", "");
    el.setAttribute("directory", "");
    el.onchange = (event) => onInputChangeRef.current(event);
  }, []);

  const uploading =
    uploadProgress?.phase === "uploading" ? uploadProgress : null;

  return (
    <div>
      {createPortal(
        <>
          <input
            id={FILE_INPUT_ID}
            ref={bindFileInput}
            type="file"
            className={bodyPickerClass}
            multiple
            tabIndex={-1}
            disabled={disabled}
            onChange={onInputChange}
          />
          <input
            id={FOLDER_INPUT_ID}
            ref={bindFolderInput}
            type="file"
            className={bodyPickerClass}
            multiple
            tabIndex={-1}
            disabled={disabled}
            onChange={onInputChange}
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
          void collectDroppedFiles(snap).then((dropped) =>
            applyIncoming(filterDroppedFiles(dropped)),
          );
        }}
      >
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={FILE_INPUT_ID}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[hsl(var(--sand)/0.9)] bg-white px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--warm-charcoal))] transition hover:border-[hsl(var(--wine-deep)/0.35)]",
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <Upload className="h-3.5 w-3.5 text-[hsl(var(--wine-deep))]" />
            选择文件
          </label>
          <label
            htmlFor={FOLDER_INPUT_ID}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[hsl(var(--sand)/0.9)] bg-white px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--warm-charcoal))] transition hover:border-[hsl(var(--wine-deep)/0.35)]",
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <Folder className="h-3.5 w-3.5 text-[hsl(var(--wine-deep))]" />
            选择文件夹
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          已选择 {picked.length} 个文件，可拖入文件夹
        </p>
        {picked.length > 0 ? (
          <ul className="mt-2 max-h-28 space-y-1.5 overflow-y-auto pr-0.5">
            {picked.map((file, idx) => {
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
                      {formatFileSize(file.size)}
                    </span>
                  </span>
                  {disabled ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        const next = picked.filter((_, i) => i !== idx);
                        setPicked(next);
                        filesRef.current = next;
                        onChange(next);
                      }}
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
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">尚未选择附件。</p>
        )}
      </div>
    </div>
  );
}
