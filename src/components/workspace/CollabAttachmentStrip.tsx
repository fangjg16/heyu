import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-auth";
import type { CollabFileRecord } from "@/lib/project-api";

export function isCollabImageFile(file: {
  mime?: string | null;
  filename?: string | null;
}): boolean {
  const mime = (file.mime ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/iu.test(file.filename ?? "");
}

function SelectedFilesPreview({ files }: { files: File[] }) {
  const previews = useMemo(
    () =>
      files.map((file) => ({
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
    <div className="flex flex-wrap gap-2">
      {previews.map((item) =>
        item.url ? (
          <img
            key={item.key}
            src={item.url}
            alt={item.name}
            className="max-h-40 max-w-full rounded-lg border border-[rgba(78,66,57,0.1)] bg-[rgba(78,66,57,0.03)] object-contain"
          />
        ) : (
          <span
            key={item.key}
            className="rounded-lg border border-[rgba(78,66,57,0.1)] bg-white px-2 py-1 text-[12px] text-[#59625F]"
          >
            {item.name}
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
}: {
  projectId: string;
  userId: string;
  files: CollabFileRecord[];
  pending?: File[];
}) {
  const images = files.filter(isCollabImageFile);
  const others = files.filter((file) => !isCollabImageFile(file));
  const imageKey = images.map((file) => file.id).join(",");
  const [urls, setUrls] = useState<Record<string, string>>({});

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
      {pending && pending.length > 0 ? <SelectedFilesPreview files={pending} /> : null}
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((file) =>
            urls[file.id] ? (
              <a
                key={file.id}
                href={urls[file.id]}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg border border-[rgba(78,66,57,0.1)] bg-[rgba(78,66,57,0.03)]"
              >
                <img
                  src={urls[file.id]}
                  alt={file.filename}
                  className="max-h-52 max-w-full object-contain"
                />
              </a>
            ) : (
              <div
                key={file.id}
                className="flex h-20 min-w-24 items-center justify-center rounded-lg border border-[rgba(78,66,57,0.1)] bg-[rgba(78,66,57,0.03)] px-2 text-[12px] text-[#969E9A]"
              >
                {file.filename}
              </div>
            ),
          )}
        </div>
      ) : null}
      {others.length > 0 ? (
        <ul className="space-y-1 text-[12.5px] text-[#59625F]">
          {others.map((file) => (
            <li key={file.id}>{file.filename}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
