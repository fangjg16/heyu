import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api-auth";
import {
  downloadFileBlob,
  FilePreviewModal,
} from "@/components/workspace/FilePreviewModal";
import type { CollabFileRecord, ProjectFileRecord } from "@/lib/project-api";

export function isCollabImageFile(file: {
  mime?: string | null;
  filename?: string | null;
}): boolean {
  const mime = (file.mime ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/iu.test(file.filename ?? "");
}

const thumbFrame =
  "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[rgba(78,66,57,0.1)] bg-[rgba(78,66,57,0.03)]";
const thumbImg = "max-h-full max-w-full object-contain";

function asProjectFile(file: CollabFileRecord): ProjectFileRecord {
  return {
    id: file.id,
    filename: file.filename,
    relativePath: file.relativePath,
    scope: "package",
    conversationId: null,
    mime: file.mime,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt || new Date(0).toISOString(),
    uploadedBy: file.uploadedBy,
    chunkCount: 0,
    sourceKind: file.sourceKind,
    sharedWithIssuer: file.sharedWithIssuer,
    fileCategory: file.fileCategory,
    versionGroup: file.versionGroup,
    replacesDocumentId: file.replacesDocumentId,
    uploadNote: file.uploadNote,
  };
}

async function saveCollabFile(
  projectId: string,
  userId: string,
  file: CollabFileRecord,
) {
  const { blob, filename } = await downloadFileBlob(
    projectId,
    file.id,
    userId,
    file.filename,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function RemoveMark({
  label,
  disabled,
  onClick,
  className,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title="删除"
      disabled={disabled}
      className={
        className ??
        "absolute right-0.5 top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[#4E4239] shadow-[0_1px_2px_rgba(31,36,35,0.35)] disabled:opacity-40"
      }
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      <X className="h-2.5 w-2.5" strokeWidth={2.5} />
    </button>
  );
}

function SelectedFilesPreview({
  files,
  onRemove,
}: {
  files: File[];
  onRemove?: (file: File) => void;
}) {
  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        key: `${file.name}:${file.size}:${file.lastModified}`,
        name: file.name,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      })),
    [files],
  );
  useEffect(() => {
    return () => {
      for (const item of previews) {
        if (item.url) URL.revokeObjectURL(item.url);
      }
    };
  }, [previews]);
  if (previews.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {previews.map((item) =>
        item.url ? (
          <span key={item.key} className="relative h-14 w-14 shrink-0">
            <span className={thumbFrame}>
              <img src={item.url} alt={item.name} className={thumbImg} />
            </span>
            {onRemove ? (
              <RemoveMark
                label={`删除 ${item.name}`}
                onClick={() => onRemove(item.file)}
              />
            ) : null}
          </span>
        ) : (
          <span
            key={item.key}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(78,66,57,0.1)] bg-white px-2 py-1 text-[12px] text-[#59625F]"
          >
            <span className="max-w-[12rem] truncate">{item.name}</span>
            {onRemove ? (
              <button
                type="button"
                aria-label={`删除 ${item.name}`}
                title="删除"
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[#8A8178] hover:bg-[rgba(78,66,57,0.06)] hover:text-[#4E4239]"
                onClick={() => onRemove(item.file)}
              >
                <X className="h-3 w-3" strokeWidth={2.25} />
              </button>
            ) : null}
          </span>
        ),
      )}
    </div>
  );
}

export function CollabAttachmentStrip({
  projectId,
  userId,
  files,
  pending,
  onRemoveFile,
  onRemovePending,
  removingFileId,
}: {
  projectId: string;
  userId: string;
  files: CollabFileRecord[];
  pending?: File[];
  onRemoveFile?: (file: CollabFileRecord) => void;
  onRemovePending?: (file: File) => void;
  removingFileId?: string | null;
}) {
  const images = files.filter(isCollabImageFile);
  const others = files.filter((file) => !isCollabImageFile(file));
  const imageKey = images.map((file) => file.id).join(",");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<CollabFileRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const targets = images;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        targets.map(async (file) => {
          try {
            const q = new URLSearchParams({ userId });
            const res = await apiFetch(
              `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(file.id)}/download?${q}`,
            );
            if (!res.ok) return;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            created.push(url);
            next[file.id] = url;
          } catch {
            /* 单张失败不影响其余图片 */
          }
        }),
      );
      if (!cancelled) setUrls(next);
    })();
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
    // imageKey captures the set of files to load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId, imageKey]);

  if (files.length === 0 && !(pending && pending.length > 0)) return null;

  return (
    <div className="space-y-2">
      {pending && pending.length > 0 ? (
        <SelectedFilesPreview files={pending} onRemove={onRemovePending} />
      ) : null}
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {images.map((file) => (
            <span key={file.id} className="relative h-14 w-14 shrink-0">
              {urls[file.id] ? (
                <a
                  href={urls[file.id]}
                  target="_blank"
                  rel="noreferrer"
                  title={file.filename}
                  className={thumbFrame}
                >
                  <img src={urls[file.id]} alt={file.filename} className={thumbImg} />
                </a>
              ) : (
                <div
                  title={file.filename}
                  className={`${thumbFrame} px-1 text-center text-[10px] leading-tight text-[#969E9A]`}
                >
                  <span className="line-clamp-2 break-all">{file.filename}</span>
                </div>
              )}
              {onRemoveFile ? (
                <RemoveMark
                  label={`删除 ${file.filename}`}
                  disabled={removingFileId === file.id}
                  onClick={() => onRemoveFile(file)}
                />
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {others.length > 0 ? (
        <ul className="space-y-1 text-[12.5px] text-[#59625F]">
          {others.map((file) => (
            <li key={file.id} className="flex items-center gap-2">
              <button
                type="button"
                title="预览并下载"
                className="min-w-0 flex-1 truncate text-left text-[#A06358] hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview(file);
                }}
              >
                {file.filename}
              </button>
              {onRemoveFile ? (
                <button
                  type="button"
                  aria-label={`删除 ${file.filename}`}
                  title="删除"
                  disabled={removingFileId === file.id}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[#8A8178] hover:bg-[rgba(78,66,57,0.06)] hover:text-[#4E4239] disabled:opacity-40"
                  onClick={() => onRemoveFile(file)}
                >
                  <X className="h-3 w-3" strokeWidth={2.25} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {preview ? (
        <FilePreviewModal
          projectId={projectId}
          userId={userId}
          file={asProjectFile(preview)}
          onClose={() => setPreview(null)}
          onDownload={() => saveCollabFile(projectId, userId, preview)}
        />
      ) : null}
    </div>
  );
}
