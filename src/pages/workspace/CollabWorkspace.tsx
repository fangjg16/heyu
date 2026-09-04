import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Upload } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  collabStatusLabel,
  fetchCollabFiles,
  fetchCollabItem,
  fetchCollabItems,
  fetchCollabOverview,
  fetchProjectByIdFromApi,
  patchCollabItemReply,
  uploadProjectPackageFile,
  type CollabFileRecord,
  type CollabItem,
  type CollabOverview,
} from "@/lib/project-api";
import {
  previewCollabQuestion,
  stripCitationMarkers,
} from "@/lib/kn-citations";
import { getMergedProjects } from "@/workspace/project-registry";
import { loadSessionUserId } from "@/workspace/session";
import {
  getProjectRole,
  isIssuerRole,
} from "@/workspace/workspace-users";
import type { WorkspaceProject } from "@/workspace/projects";
import { apiFetch } from "@/lib/api-auth";

async function downloadCollabFile(
  projectId: string,
  fileId: string,
  userId: string,
  fallbackName: string,
): Promise<void> {
  const q = new URLSearchParams({ userId });
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/download?${q}`,
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err || `下载失败（${res.status}）`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fallbackName || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sourceKindLabel(kind: string | null): string {
  if (kind === "issuer_upload") return "我方上传";
  if (kind === "investor_share") return "投资方共享";
  return "—";
}

function CollabFinalVersionToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex h-9 items-center gap-2 text-[12.5px] text-[#1F2423]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded border-[rgba(78,66,57,0.28)] bg-white accent-[#A06358]"
      />
      最终版本
    </label>
  );
}

function CollabFilePicker({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="sm:col-span-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.currentTarget.value = "";
          if (f) onPick(f);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgba(160,99,88,0.28)] bg-white px-3 text-[12.5px] font-medium text-[#A06358] transition-colors hover:bg-[rgba(160,99,88,0.06)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Upload className="h-3.5 w-3.5" strokeWidth={1.8} />
        选择文件
      </button>
    </div>
  );
}

function CollabHeader({
  project,
  tab,
}: {
  project: WorkspaceProject;
  tab: "overview" | "items" | "files";
}) {
  const tabs = [
    { id: "overview" as const, label: "协作概览", to: `/app/collab/${project.id}` },
    {
      id: "items" as const,
      label: "待确认事项",
      to: `/app/collab/${project.id}/items`,
    },
    { id: "files" as const, label: "源文件", to: `/app/collab/${project.id}/files` },
  ];
  return (
    <div className="border-b border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.9)]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-end justify-between gap-3 px-6 py-5 md:px-8">
        <div>
          <div className="text-[11px] font-medium tracking-wide text-[#A06358]">
            项目协作方协作
          </div>
          <h1 className="mt-1 font-[family-name:var(--font-serif,serif)] text-[22px] font-semibold text-[#1F2423]">
            {project.name}
          </h1>
        </div>
        <nav className="flex gap-1 rounded-xl bg-[rgba(78,66,57,0.06)] p-1">
          {tabs.map((t) => (
            <NavLink
              key={t.id}
              to={t.to}
              end={t.id === "overview"}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                  isActive || tab === t.id
                    ? "bg-white text-[#1F2423] shadow-sm"
                    : "text-[#59625F]"
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function CollabWorkspaceLayout() {
  const { projectId = "" } = useParams();
  const userId = loadSessionUserId() ?? "";
  const [project, setProject] = useState<WorkspaceProject | null>(null);

  useEffect(() => {
    const local = getMergedProjects().find((p) => p.id === projectId) ?? null;
    setProject(local);
    if (!projectId) return;
    void fetchProjectByIdFromApi(projectId)
      .then((p) => {
        if (p) setProject(p);
      })
      .catch(() => {
        /* keep local */
      });
  }, [projectId]);

  if (!project) {
    return (
      <WorkspaceShell>
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          加载项目…
        </div>
      </WorkspaceShell>
    );
  }

  const role = getProjectRole(userId, project.id, project.createdBy, project.analysisKind);
  if (!isIssuerRole(role)) {
    if (role === "guest") {
      return <Navigate to="/app/projects" replace />;
    }
    return <Navigate to={`/app/projects/${project.id}/collab`} replace />;
  }

  return (
    <WorkspaceShell contentClassName="!overflow-y-auto">
      <Outlet context={{ project, userId }} />
    </WorkspaceShell>
  );
}

function useCollabOutlet() {
  const { projectId = "" } = useParams();
  const userId = loadSessionUserId() ?? "";
  const project =
    getMergedProjects().find((p) => p.id === projectId) ??
    ({
      id: projectId,
      name: "项目",
      createdBy: "",
    } as WorkspaceProject);
  return { project, userId };
}

export function CollabOverviewPage() {
  const { project } = useCollabOutlet();
  const [data, setData] = useState<CollabOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCollabOverview(project.id)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  return (
    <>
      <CollabHeader project={project} tab="overview" />
      <div className="mx-auto max-w-[1180px] px-6 py-8 md:px-8">
        {error ? (
          <p className="text-[13px] text-[#A06358]">{error}</p>
        ) : !data ? (
          <p className="text-[13px] text-[#969E9A]">加载协作概览…</p>
        ) : data.itemCount === 0 ? (
          <div className="rounded-2xl border border-[rgba(78,66,57,0.1)] bg-white/80 px-6 py-10 text-[14px] leading-relaxed text-[#59625F]">
            投资团队暂未向你发布待确认事项。你仍可在「源文件」中上传补充资料。
          </div>
        ) : (
          <>
            <div className="grid max-w-[580px] gap-3 sm:grid-cols-2">
              {[
                ["待回复事项", data.counts.pendingReply],
                ["已提交待审核", data.counts.submitted],
              ].map(([label, n]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-[rgba(78,66,57,0.1)] bg-white/80 px-4 py-4"
                >
                  <div className="text-[12px] text-[#59625F]">{label}</div>
                  <div className="mt-1 text-[28px] font-semibold text-[#1F2423]">
                    {n}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-[rgba(78,66,57,0.1)] bg-white/80 px-5 py-4">
              <div className="text-[12px] font-semibold text-[#59625F]">
                下一步建议
              </div>
              {data.nextSuggestions.length === 0 ? (
                <p className="mt-2 text-[13px] text-[#969E9A]">暂无待办。</p>
              ) : (
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-[#1F2423]">
                  {data.nextSuggestions.map((s) => (
                    <li key={s}>{stripCitationMarkers(s)}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 text-[12px] text-[#969E9A]">
                {data.nearestDueAt
                  ? `最近截止日期：${data.nearestDueAt.slice(0, 10)}`
                  : "暂无截止日期"}
                {data.latestReplyAt
                  ? ` · 最近回复 ${data.latestReplyAt.replace("T", " ").slice(0, 16)}`
                  : ""}
              </div>
            </div>
            <Link
              to={`/app/collab/${project.id}/items`}
              className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#A06358] px-4 text-[13.5px] font-medium text-white"
            >
              查看待确认事项
            </Link>
          </>
        )}
      </div>
    </>
  );
}

export function CollabItemsPage() {
  const { project } = useCollabOutlet();
  const [items, setItems] = useState<CollabItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCollabItems(project.id)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  return (
    <>
      <CollabHeader project={project} tab="items" />
      <div className="mx-auto max-w-[1180px] px-6 py-8 md:px-8">
        {error ? <p className="text-[13px] text-[#A06358]">{error}</p> : null}
        {items.length === 0 && !error ? (
          <div className="rounded-2xl border border-[rgba(78,66,57,0.1)] bg-white/80 px-6 py-10 text-[14px] leading-relaxed text-[#59625F]">
            投资团队暂未向你发布待确认事项。
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => {
              const preview = previewCollabQuestion(it);
              return (
                <li key={it.id}>
                  <Link
                    to={`/app/collab/${project.id}/items/${it.id}`}
                    className="flex items-start justify-between gap-3 rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/80 px-4 py-3 hover:border-[rgba(160,99,88,0.3)]"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#1F2423]">{preview.title}</div>
                      {preview.detail ? (
                        <div className="mt-1 line-clamp-2 text-[12.5px] text-[#59625F]">
                          {preview.detail}
                        </div>
                      ) : null}
                      <div className="mt-1.5 text-[11.5px] text-[#969E9A]">
                        {it.priority}
                        {it.dueAt ? ` · 截止 ${it.dueAt.slice(0, 10)}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-[rgba(160,99,88,0.1)] px-2 py-0.5 text-[11px] font-medium text-[#A06358]">
                      {collabStatusLabel(it.status, "issuer")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

export function CollabItemDetailPage() {
  const { project, userId } = useCollabOutlet();
  const { itemId = "" } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<CollabItem | null>(null);
  const [files, setFiles] = useState<CollabFileRecord[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [period, setPeriod] = useState("");
  const [isFinal, setIsFinal] = useState(false);
  const [note, setNote] = useState("");
  const [replacesId, setReplacesId] = useState("");

  const load = useCallback(async () => {
    const data = await fetchCollabItem(project.id, itemId);
    setItem(data.item);
    setFiles(data.files);
    setReply(data.item.replyText ?? "");
  }, [project.id, itemId]);

  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "加载失败"),
    );
  }, [load]);

  const locked = item?.status === "confirmed" || item?.status === "submitted";

  const onSave = async (submit: boolean) => {
    if (!item) return;
    setBusy(submit ? "submit" : "save");
    setError(null);
    try {
      const next = await patchCollabItemReply(project.id, item.id, {
        action: submit ? "submit" : "save",
        replyText: reply,
      });
      setItem(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(null);
    }
  };

  const onUpload = async (file: File) => {
    setBusy("upload");
    setError(null);
    try {
      await uploadProjectPackageFile(project.id, userId, file, {
        relativePath: "项目方上传",
        collabItemId: itemId,
        fileCategory: category || undefined,
        periodLabel: period || undefined,
        isFinal,
        uploadNote: note || undefined,
        replacesDocumentId: replacesId || undefined,
        versionGroup: replacesId || undefined,
      });
      await load();
      setIsFinal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(null);
    }
  };

  const preview = item ? previewCollabQuestion(item) : null;

  return (
    <>
      <CollabHeader project={project} tab="items" />
      <div className="mx-auto max-w-[860px] px-6 py-8 md:px-8">
        <button
          type="button"
          onClick={() => navigate(`/app/collab/${project.id}/items`)}
          className="text-[13px] text-[#A06358] hover:underline"
        >
          ← 返回事项列表
        </button>
        {error ? (
          <p className="mt-3 text-[13px] text-[#A06358]">{error}</p>
        ) : null}
        {!item || !preview ? (
          <p className="mt-4 text-[13px] text-[#969E9A]">加载事项…</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-[rgba(78,66,57,0.1)] bg-white/80 p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[18px] font-semibold text-[#1F2423]">
                  {preview.title}
                </h2>
                <span className="text-[12px] text-[#A06358]">
                  {collabStatusLabel(item.status, "issuer")}
                </span>
              </div>
              {preview.detail && preview.detail !== preview.title ? (
                <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#1F2423]">
                  {preview.detail}
                </p>
              ) : null}
              {item.investorNote ? (
                <p className="mt-3 rounded-lg bg-[rgba(78,66,57,0.05)] px-3 py-2 text-[12.5px] text-[#59625F]">
                  投资人说明：{item.investorNote}
                </p>
              ) : null}
              <div className="mt-2 text-[12px] text-[#969E9A]">
                回复方式：
                {item.replyMode === "text"
                  ? "文字"
                  : item.replyMode === "file"
                    ? "上传文件"
                    : "文字与文件"}
                {item.dueAt ? ` · 截止 ${item.dueAt.slice(0, 10)}` : ""}
              </div>
              {item.fileReqs.length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-[12.5px] text-[#59625F]">
                  {item.fileReqs.map((f) => (
                    <li key={f.id}>
                      {f.label}
                      {f.required ? "（必须）" : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              {item.reviewNote && item.status === "needs_more" ? (
                <p className="mt-3 text-[12.5px] text-[#A06358]">
                  需补充：{item.reviewNote}
                </p>
              ) : null}
            </div>

            {item.replyMode !== "file" ? (
              <div className="rounded-2xl border border-[rgba(78,66,57,0.1)] bg-white/80 p-5">
                <div className="text-[12px] font-semibold text-[#59625F]">
                  文字答复
                </div>
                <textarea
                  value={reply}
                  disabled={locked}
                  onChange={(e) => setReply(e.target.value)}
                  rows={6}
                  className="mt-2 w-full rounded-xl border border-[rgba(78,66,57,0.12)] px-3 py-2 text-[13px] outline-none"
                />
              </div>
            ) : null}

            {item.replyMode !== "text" ? (
              <div className="rounded-2xl border border-[rgba(78,66,57,0.1)] bg-white/80 p-5">
                <div className="text-[12px] font-semibold text-[#59625F]">
                  关联附件
                </div>
                <ul className="mt-2 space-y-1 text-[13px]">
                  {files.map((f) => (
                    <li key={f.id} className="text-[#1F2423]">
                      <button
                        type="button"
                        className="text-left text-[#A06358] hover:underline"
                        onClick={() =>
                          void downloadCollabFile(
                            project.id,
                            f.id,
                            userId,
                            f.filename,
                          ).catch((e) =>
                            setError(e instanceof Error ? e.message : "下载失败"),
                          )
                        }
                      >
                        {f.filename}
                      </button>
                      {f.fileCategory ? ` · ${f.fileCategory}` : ""}
                      {f.isFinal ? " · 最终版" : ""}
                    </li>
                  ))}
                </ul>
                {!locked ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input
                      placeholder="文件类别"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[12.5px]"
                    />
                    <input
                      placeholder="资料期间"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[12.5px]"
                    />
                    <CollabFinalVersionToggle
                      checked={isFinal}
                      onChange={setIsFinal}
                    />
                    <select
                      value={replacesId}
                      onChange={(e) => setReplacesId(e.target.value)}
                      className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[12.5px]"
                    >
                      <option value="">新文件（不覆盖旧版）</option>
                      {files.map((f) => (
                        <option key={f.id} value={f.id}>
                          作为「{f.filename}」新版本
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="补充说明"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[12.5px] sm:col-span-2"
                    />
                    <CollabFilePicker
                      disabled={Boolean(busy)}
                      onPick={(f) => void onUpload(f)}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {!locked ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void onSave(false)}
                  className="h-10 rounded-xl border border-[rgba(78,66,57,0.18)] px-4 text-[13px]"
                >
                  {busy === "save" ? "保存中…" : "保存草稿"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void onSave(true)}
                  className="h-10 rounded-xl bg-[#A06358] px-4 text-[13px] font-medium text-white"
                >
                  {busy === "submit" ? "提交中…" : "提交给投资团队"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

export function CollabFilesPage() {
  const { project, userId } = useCollabOutlet();
  const [files, setFiles] = useState<CollabFileRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("");
  const [period, setPeriod] = useState("");
  const [isFinal, setIsFinal] = useState(false);
  const [note, setNote] = useState("");
  const [replacesId, setReplacesId] = useState("");

  const load = useCallback(() => {
    return fetchCollabFiles(project.id).then(setFiles);
  }, [project.id]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, [load]);

  const onUpload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      await uploadProjectPackageFile(project.id, userId, file, {
        relativePath: "项目方上传",
        fileCategory: category || undefined,
        periodLabel: period || undefined,
        isFinal,
        uploadNote: note || undefined,
        replacesDocumentId: replacesId || undefined,
        versionGroup: replacesId || undefined,
      });
      await load();
      setIsFinal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const byKind: Record<string, CollabFileRecord[]> = {
      issuer_upload: [],
      investor_share: [],
    };
    for (const f of files) {
      const k = f.sourceKind || "investor_share";
      if (!byKind[k]) byKind[k] = [];
      byKind[k]!.push(f);
    }
    return byKind;
  }, [files]);

  return (
    <>
      <CollabHeader project={project} tab="files" />
      <div className="mx-auto max-w-[1180px] px-6 py-8 md:px-8">
        {error ? <p className="text-[13px] text-[#A06358]">{error}</p> : null}
        {(["issuer_upload", "investor_share"] as const).map(
          (k) => (
            <section key={k} className="mb-6">
              <h2 className="text-[14px] font-semibold text-[#1F2423]">
                {sourceKindLabel(k)}
              </h2>
              {(grouped[k] ?? []).length === 0 ? (
                <p className="mt-2 text-[13px] text-[#969E9A]">暂无</p>
              ) : (
                <ul className="mt-2 divide-y divide-[rgba(78,66,57,0.08)] rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/80">
                  {(grouped[k] ?? []).map((f) => (
                    <li key={f.id} className="px-4 py-2.5 text-[13px]">
                      <button
                        type="button"
                        className="font-medium text-[#A06358] hover:underline"
                        onClick={() =>
                          void downloadCollabFile(
                            project.id,
                            f.id,
                            userId,
                            f.filename,
                          ).catch((e) =>
                            setError(e instanceof Error ? e.message : "下载失败"),
                          )
                        }
                      >
                        {f.filename}
                      </button>
                      <div className="text-[11.5px] text-[#969E9A]">
                        {f.fileCategory ?? "未分类"}
                        {f.periodLabel ? ` · ${f.periodLabel}` : ""}
                        {f.isFinal ? " · 最终版" : ""}
                        {f.replacesDocumentId ? " · 新版本" : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ),
        )}
        <section className="mb-6 rounded-2xl border border-[rgba(78,66,57,0.1)] bg-white/80 p-5">
          <h2 className="text-[14px] font-semibold text-[#1F2423]">上传补充资料</h2>
          <p className="mt-1 text-[12.5px] text-[#59625F]">
            未挂到具体事项的资料也会出现在「我方上传」，投资团队可以看到。
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              placeholder="文件类别"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[12.5px]"
            />
            <input
              placeholder="资料期间"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[12.5px]"
            />
            <CollabFinalVersionToggle
              checked={isFinal}
              onChange={setIsFinal}
            />
            <select
              value={replacesId}
              onChange={(e) => setReplacesId(e.target.value)}
              className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[12.5px]"
            >
              <option value="">新文件（不覆盖旧版）</option>
              {(grouped.issuer_upload ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  作为「{f.filename}」新版本
                </option>
              ))}
            </select>
            <input
              placeholder="补充说明"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[12.5px] sm:col-span-2"
            />
            <CollabFilePicker
              disabled={busy}
              onPick={(f) => void onUpload(f)}
            />
          </div>
        </section>
      </div>
    </>
  );
}
