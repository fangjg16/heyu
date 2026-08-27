import { useSyncExternalStore } from "react";
import {
  uploadProjectPackageFile,
  type UploadProjectFileResult,
} from "@/lib/project-api";

export type UploadQueueItem = {
  file: File;
  relativePath: string;
};

export type UploadJobStatus = "queued" | "uploading" | "done" | "error";

export type UploadJob = {
  id: string;
  projectId: string;
  projectName: string;
  userId: string;
  items: UploadQueueItem[];
  done: number;
  total: number;
  ok: number;
  currentName: string;
  status: UploadJobStatus;
  errors: string[];
  uploadedIds: string[];
  parseIds: string[];
};

export type UploadSnapshot = {
  jobs: UploadJob[];
  active: UploadJob | null;
};

const listeners = new Set<() => void>();
const jobs: UploadJob[] = [];
let snapshot: UploadSnapshot = { jobs: [], active: null };
let pumping = false;

function emit(): void {
  snapshot = {
    jobs: jobs.map((j) => ({ ...j, items: j.items, errors: [...j.errors] })),
    active:
      jobs.find((j) => j.status === "queued" || j.status === "uploading") ??
      null,
  };
  listeners.forEach((fn) => fn());
}

export function subscribeUploadQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUploadSnapshot(): UploadSnapshot {
  return snapshot;
}

export function useUploadQueue(): UploadSnapshot {
  return useSyncExternalStore(
    subscribeUploadQueue,
    getUploadSnapshot,
    getUploadSnapshot,
  );
}

function newJobId(): string {
  return `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function findActiveJob(projectId: string, userId: string): UploadJob | undefined {
  return jobs.find(
    (j) =>
      j.projectId === projectId &&
      j.userId === userId &&
      (j.status === "queued" || j.status === "uploading"),
  );
}

export function enqueueProjectUpload(input: {
  projectId: string;
  projectName: string;
  userId: string;
  items: UploadQueueItem[];
}): void {
  const items = input.items.filter((it) => it.file);
  if (!items.length) return;

  const existing = findActiveJob(input.projectId, input.userId);
  if (existing) {
    existing.items.push(...items);
    existing.total = existing.items.length;
    emit();
    void pump();
    return;
  }

  jobs.push({
    id: newJobId(),
    projectId: input.projectId,
    projectName: input.projectName,
    userId: input.userId,
    items: [...items],
    done: 0,
    total: items.length,
    ok: 0,
    currentName: "",
    status: "queued",
    errors: [],
    uploadedIds: [],
    parseIds: [],
  });
  emit();
  void pump();
}

function pruneOldJobs(): void {
  const keepActive = jobs.filter(
    (j) => j.status === "queued" || j.status === "uploading",
  );
  const finished = jobs.filter(
    (j) => j.status === "done" || j.status === "error",
  );
  const recent = finished.slice(-4);
  jobs.length = 0;
  jobs.push(...keepActive, ...recent);
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (true) {
      const job = jobs.find(
        (j) => j.status === "queued" || j.status === "uploading",
      );
      if (!job) break;
      job.status = "uploading";
      emit();
      while (job.done < job.items.length) {
        const item = job.items[job.done]!;
        job.currentName = item.file.name;
        emit();
        try {
          const uploaded: UploadProjectFileResult = await uploadProjectPackageFile(
            job.projectId,
            job.userId,
            item.file,
            { relativePath: item.relativePath },
          );
          job.ok += 1;
          if (uploaded.documentId) {
            job.uploadedIds.push(uploaded.documentId);
            if (
              (uploaded.parseQueued || uploaded.parsed) &&
              item.file.name !== ".keep"
            ) {
              job.parseIds.push(uploaded.documentId);
            }
            for (const childId of uploaded.childDocumentIds ?? []) {
              if (childId && !job.parseIds.includes(childId)) {
                job.parseIds.push(childId);
              }
            }
          }
        } catch (e) {
          job.errors.push(
            `${item.file.name}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        job.done += 1;
        emit();
      }
      job.currentName = "";
      job.status = job.ok === 0 && job.errors.length > 0 ? "error" : "done";
      emit();
      pruneOldJobs();
      emit();
    }
  } finally {
    pumping = false;
  }
}

export function uploadHintForProject(projectId: string): string | null {
  const active = jobs.find(
    (j) =>
      j.projectId === projectId &&
      (j.status === "queued" || j.status === "uploading"),
  );
  if (active) {
    const name = active.currentName ? `：${active.currentName}` : "";
    return `后台上传 ${active.done}/${active.total}${name}`;
  }
  const last = [...jobs]
    .reverse()
    .find((j) => j.projectId === projectId && (j.status === "done" || j.status === "error"));
  if (!last) return null;
  if (last.status === "error") {
    return `上传失败：${last.errors.slice(0, 2).join("；")}`;
  }
  if (last.errors.length > 0) {
    return `已上传 ${last.ok}/${last.total}。失败：${last.errors.slice(0, 2).join("；")}${
      last.errors.length > 2 ? "…" : ""
    }`;
  }
  if (last.parseIds.length > 0) {
    return `已上传 ${last.ok} 个文件，正在自动解析 ${last.parseIds.length} 个…`;
  }
  return `已上传 ${last.ok} 个文件`;
}

export function topBarUploadLabel(): string | null {
  const actives = jobs.filter(
    (j) => j.status === "queued" || j.status === "uploading",
  );
  if (actives.length === 0) return null;
  const done = actives.reduce((n, j) => n + j.done, 0);
  const total = actives.reduce((n, j) => n + j.total, 0);
  if (actives.length === 1) {
    const job = actives[0]!;
    return `上传中 ${done}/${total} · ${job.projectName}`;
  }
  return `后台上传 ${done}/${total}（${actives.length} 个项目）`;
}
