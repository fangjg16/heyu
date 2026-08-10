import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createAdminSkill,
  deleteAdminSkill,
  fetchAdminSkillContent,
  fetchAdminSkills,
  importSkillsFromVolume,
  restartHermesGateway,
  saveAdminSkillContent,
  syncAllAdminSkills,
  syncOneAdminSkill,
  type AdminSkillRow,
  type AdminSkillsList,
} from "@/lib/admin-skills-api";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

const SKILL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;

function syncBadge(status: AdminSkillRow["syncStatus"]) {
  if (status === "ok") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "error") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "not_in_db") {
    return "border-slate-300 bg-slate-50 text-slate-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function syncLabel(status: AdminSkillRow["syncStatus"]) {
  if (status === "ok") return "已同步到卷";
  if (status === "error") return "同步失败";
  if (status === "not_in_db") return "本地未入库";
  return "待同步";
}

export function AdminSkillsSection() {
  const [list, setList] = useState<AdminSkillsList | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const [editName, setEditName] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editMeta, setEditMeta] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [importConfirm, setImportConfirm] = useState(false);
  const [syncConfirm, setSyncConfirm] = useState(false);
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useBodyScrollLock(
    Boolean(
      editName ||
        createOpen ||
        deleteName ||
        importConfirm ||
        syncConfirm ||
        restartConfirm,
    ),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminSkills();
      setList(data);
      if (data.volumeWarning) {
        setWarn(`本地卷列表：${data.volumeWarning}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setList(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSyncAll = async () => {
    setSyncing(true);
    setError(null);
    setHint(null);
    setWarn(null);
    try {
      const result = await syncAllAdminSkills();
      setHint(result.hint || `已同步 ${result.copied}/${result.total}`);
      if (result.errors.length > 0) {
        setWarn(
          result.errors.map((x) => `${x.name}: ${x.error}`).join("；"),
        );
      }
      setSyncConfirm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const onRetryOne = async (name: string) => {
    setError(null);
    setWarn(null);
    try {
      const result = await syncOneAdminSkill(name);
      if (result.syncWarning) setWarn(result.syncWarning);
      else setHint(result.hint || `已同步 ${name}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onImport = async () => {
    setImporting(true);
    setError(null);
    setHint(null);
    setWarn(null);
    try {
      const result = await importSkillsFromVolume();
      setHint(result.hint || `已导入 ${result.imported}/${result.total}`);
      if (result.errors.length > 0) {
        setWarn(
          result.errors.map((x) => `${x.name}: ${x.error}`).join("；"),
        );
      }
      setImportConfirm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const openEdit = async (name: string) => {
    setEditName(name);
    setEditTitle(name);
    setEditDescription("");
    setEditContent("");
    setEditMeta(null);
    setEditError(null);
    setEditLoading(true);
    try {
      const data = await fetchAdminSkillContent(name);
      setEditTitle(data.title);
      setEditDescription(data.description);
      setEditContent(data.content);
      setEditMeta(
        [
          `${data.files.length} 个文件`,
          data.syncStatus === "error" && data.syncError
            ? `同步失败：${data.syncError}`
            : syncLabel(data.syncStatus),
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditLoading(false);
    }
  };

  const onSaveEdit = async () => {
    if (!editName) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const result = await saveAdminSkillContent(
        editName,
        editContent,
        editDescription,
      );
      if (result.syncWarning) {
        setWarn(result.syncWarning);
        setHint(result.hint || `已保存 ${result.name}（卷同步失败）`);
      } else {
        setWarn(null);
        setHint(result.hint || `已保存并同步 ${result.name}`);
      }
      setEditName(null);
      await load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSaving(false);
    }
  };

  const openCreate = () => {
    setCreateOpen(true);
    setCreateName("");
    setCreateTitle("");
    setCreateDescription("");
    setCreateError(null);
  };

  const onCreate = async () => {
    const name = createName.trim();
    if (!SKILL_NAME_RE.test(name) || name.includes("..")) {
      setCreateError("目录名须以字母或数字开头，仅含字母、数字、. _ -");
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      const result = await createAdminSkill({
        name,
        title: createTitle.trim() || undefined,
        description: createDescription.trim() || undefined,
      });
      if (result.syncWarning) setWarn(result.syncWarning);
      setHint(result.hint || `已创建 ${result.name}`);
      setCreateOpen(false);
      await load();
      void openEdit(result.name);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateSaving(false);
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteName) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const result = await deleteAdminSkill(deleteName);
      if (result.syncWarning) setWarn(result.syncWarning);
      setHint(result.hint || `已删除 ${result.name}`);
      setDeleteName(null);
      if (editName === deleteName) setEditName(null);
      await load();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  const onRestartGateway = async () => {
    setRestarting(true);
    setError(null);
    setHint(null);
    setWarn(null);
    try {
      const result = await restartHermesGateway();
      setHint(result.hint || "已触发 Hermes Gateway 滚动重启");
      setRestartConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestarting(false);
    }
  };

  const skills: AdminSkillRow[] = list?.skills ?? [];
  const restartConfigured = Boolean(list?.hermesRestartConfigured);
  const anyModal = Boolean(
    editName ||
      createOpen ||
      deleteName ||
      importConfirm ||
      syncConfirm ||
      restartConfirm,
  );

  return (
    <section
      className="mt-6 rounded-2xl border border-[hsl(var(--wine-deep)/0.18)] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] md:p-5"
      aria-labelledby="admin-skills-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--wine-deep)/0.08)] text-[hsl(var(--wine-deep))]">
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
          </div>
          <div>
            <h2
              id="admin-skills-heading"
              className="text-xs font-bold uppercase tracking-wide text-foreground"
            >
              Skills 管理
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              以 MySQL 为权威源：编辑后自动整树同步到 Hermes
              文件卷。首次请「同步到 MySQL」或本地{" "}
              <code className="text-[10px]">npm run seed:hermes-skills</code>
              。写入卷后需要时请「重启 Hermes Gateway」。
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            disabled={loading || restarting || !restartConfigured}
            title={
              restartConfigured
                ? "本地：docker restart jfo-hermes-local；ACK：滚动重启 Deployment"
                : "未启用重启（可设 HERMES_RESTART_MODE=docker）"
            }
            onClick={() => setRestartConfirm(true)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-white px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted/40",
              (loading || restarting || !restartConfigured) &&
                "pointer-events-none opacity-50",
            )}
          >
            {restarting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            )}
            重启 Hermes Gateway
          </button>
          <button
            type="button"
            disabled={loading || importing}
            onClick={() => setImportConfirm(true)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-white px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted/40",
              (loading || importing) && "pointer-events-none opacity-50",
            )}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            同步到 MySQL
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={openCreate}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--wine-deep)/0.32)] bg-[hsl(var(--wine-deep))] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-92",
              loading && "pointer-events-none opacity-50",
            )}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            新建 Skill
          </button>
          <button
            type="button"
            disabled={syncing || loading}
            onClick={() => setSyncConfirm(true)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--wine-deep)/0.32)] bg-[hsl(var(--wine-deep)/0.06)] px-3 py-1.5 text-[11px] font-semibold text-[hsl(var(--wine-deep))] transition-colors hover:bg-[hsl(var(--wine-deep)/0.1)]",
              (syncing || loading) && "pointer-events-none opacity-50",
            )}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            )}
            从 MySQL 同步
          </button>
        </div>
      </div>

      {list ? (
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          共 {skills.length} 个（库{" "}
          {skills.filter((s) => s.inDatabase).length} · 本地卷{" "}
          {skills.filter((s) => s.onVolume || s.syncStatus === "not_in_db").length}
          ）
          {list.volumeDir ? (
            <>
              <br />
              本地目录：{list.volumeDir}
            </>
          ) : null}
          {list.bridgeConfigured
            ? " · Bridge 已配置"
            : " · Bridge 未配置（保存后无法落盘）"}
          {list.hermesRestartConfigured
            ? " · Gateway 一键重启可用"
            : " · Gateway 一键重启未配置"}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          加载 skills…
        </p>
      ) : null}

      {error && !anyModal ? (
        <p className="mt-3 rounded-lg border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-700">
          {error}
        </p>
      ) : null}

      {warn ? (
        <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900">
          {warn}
        </p>
      ) : null}

      {hint ? (
        <p className="mt-3 text-[11px] font-medium text-emerald-700">{hint}</p>
      ) : null}

      {!loading && skills.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {skills.map((s) => (
            <li
              key={s.name}
              className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {s.title}
                </p>
                {s.description ? (
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-foreground/80">
                    {s.description}
                  </p>
                ) : null}
                <p className="truncate text-[11px] text-muted-foreground">
                  {s.name}
                  {s.inDatabase ? ` · ${s.fileCount} 文件` : " · 仅本地"}
                  {s.onVolume && s.inDatabase ? " · 卷上有" : ""}
                  {s.intents.length > 0
                    ? ` · 路由：${s.intents.join(", ")}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    syncBadge(s.syncStatus),
                  )}
                  title={s.syncError ?? undefined}
                >
                  {syncLabel(s.syncStatus)}
                </span>
                {s.syncStatus === "error" ? (
                  <button
                    type="button"
                    onClick={() => void onRetryOne(s.name)}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                  >
                    重试同步
                  </button>
                ) : null}
                {s.syncStatus === "not_in_db" ? (
                  <button
                    type="button"
                    onClick={() => void openEdit(s.name)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-800 hover:bg-slate-100"
                  >
                    入库并编辑
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void openEdit(s.name)}
                    className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/40"
                  >
                    <Pencil className="h-3 w-3" aria-hidden />
                    编辑
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDeleteName(s.name);
                    setDeleteError(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-200/80 bg-rose-50/70 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && !error && skills.length === 0 ? (
        <p className="mt-4 text-[11px] text-muted-foreground">
          库中尚无 skill。请「同步到 MySQL」或运行{" "}
          <code className="text-[10px]">npm run seed:hermes-skills</code>。
        </p>
      ) : null}

      {importConfirm && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
              role="dialog"
              aria-modal
              aria-labelledby="admin-skill-import-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !importing) {
                  setImportConfirm(false);
                }
              }}
            >
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-border/80 bg-white shadow-2xl">
                <div className="border-b border-border/60 px-5 py-4">
                  <h3
                    id="admin-skill-import-title"
                    className="font-display text-lg font-semibold text-foreground"
                  >
                    同步到 MySQL
                  </h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                    将本地/文件卷上的 skill 整目录写入 MySQL，并覆盖同名
                    skill。确定继续？
                  </p>
                </div>
                <div className="flex justify-end gap-2 px-5 py-3">
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => setImportConfirm(false)}
                    className="rounded-full border border-border/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => void onImport()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--wine-deep))] px-4 py-2 text-xs font-semibold text-white hover:opacity-92 disabled:opacity-60"
                  >
                    {importing ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    确认同步
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {syncConfirm && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
              role="dialog"
              aria-modal
              aria-labelledby="admin-skill-sync-mysql-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !syncing) {
                  setSyncConfirm(false);
                }
              }}
            >
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-border/80 bg-white shadow-2xl">
                <div className="border-b border-border/60 px-5 py-4">
                  <h3
                    id="admin-skill-sync-mysql-title"
                    className="font-display text-lg font-semibold text-foreground"
                  >
                    从 MySQL 同步
                  </h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                    将把 MySQL 中全部 skill
                    整树覆盖写入本地/文件卷，可能覆盖卷上现有文件。确定继续？
                  </p>
                </div>
                <div className="flex justify-end gap-2 px-5 py-3">
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => setSyncConfirm(false)}
                    className="rounded-full border border-border/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => void onSyncAll()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--wine-deep))] px-4 py-2 text-xs font-semibold text-white hover:opacity-92 disabled:opacity-60"
                  >
                    {syncing ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    确认同步
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {restartConfirm && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
              role="dialog"
              aria-modal
              aria-labelledby="admin-skill-restart-gateway-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !restarting) {
                  setRestartConfirm(false);
                }
              }}
            >
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-border/80 bg-white shadow-2xl">
                <div className="border-b border-border/60 px-5 py-4">
                  <h3
                    id="admin-skill-restart-gateway-title"
                    className="font-display text-lg font-semibold text-foreground"
                  >
                    重启 Hermes Gateway
                  </h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                    本地将执行{" "}
                    <code className="text-[11px]">docker restart</code>{" "}
                    （默认容器{" "}
                    <code className="text-[11px]">jfo-hermes-local</code>
                    ）；生产 ACK 则为 Deployment
                    滚动重启。进行中的分析任务可能被中断。确定继续？
                  </p>
                </div>
                <div className="flex justify-end gap-2 px-5 py-3">
                  <button
                    type="button"
                    disabled={restarting}
                    onClick={() => setRestartConfirm(false)}
                    className="rounded-full border border-border/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={restarting}
                    onClick={() => void onRestartGateway()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--wine-deep))] px-4 py-2 text-xs font-semibold text-white hover:opacity-92 disabled:opacity-60"
                  >
                    {restarting ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    确认重启
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {createOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
              role="dialog"
              aria-modal
              aria-labelledby="admin-skill-create-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !createSaving) {
                  setCreateOpen(false);
                }
              }}
            >
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-border/80 bg-white shadow-2xl">
                <div className="border-b border-border/60 px-5 py-4">
                  <h3
                    id="admin-skill-create-title"
                    className="font-display text-lg font-semibold text-foreground"
                  >
                    新建 Skill
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    写入 MySQL 后自动同步到卷，并生成默认 SKILL.md。
                  </p>
                </div>
                <div className="space-y-3 px-5 py-4">
                  <label className="block">
                    <span className="text-[11px] font-semibold text-foreground">
                      目录名（必填）
                    </span>
                    <input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="如 my-custom-skill"
                      autoComplete="off"
                      spellCheck={false}
                      className="mt-1 w-full rounded-lg border border-[hsl(var(--sand))] bg-[hsl(var(--linen)/0.35)] px-3 py-2 font-mono text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--wine-deep)/0.35)]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold text-foreground">
                      显示标题（可选）
                    </span>
                    <input
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                      placeholder="写入 SKILL.md 首行标题"
                      className="mt-1 w-full rounded-lg border border-[hsl(var(--sand))] bg-[hsl(var(--linen)/0.35)] px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--wine-deep)/0.35)]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold text-foreground">
                      作用描述（可选）
                    </span>
                    <textarea
                      value={createDescription}
                      onChange={(e) => setCreateDescription(e.target.value)}
                      placeholder="一句话说明这个 skill 做什么"
                      rows={2}
                      maxLength={512}
                      className="mt-1 w-full resize-y rounded-lg border border-[hsl(var(--sand))] bg-[hsl(var(--linen)/0.35)] px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--wine-deep)/0.35)]"
                    />
                  </label>
                  {createError ? (
                    <p className="rounded-lg border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-700">
                      {createError}
                    </p>
                  ) : null}
                </div>
                <div className="flex justify-end gap-2 border-t border-border/60 px-5 py-3">
                  <button
                    type="button"
                    disabled={createSaving}
                    onClick={() => setCreateOpen(false)}
                    className="rounded-full border border-border/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={createSaving || !createName.trim()}
                    onClick={() => void onCreate()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--wine-deep))] px-4 py-2 text-xs font-semibold text-white hover:opacity-92 disabled:opacity-60"
                  >
                    {createSaving ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    创建
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {deleteName && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
              role="dialog"
              aria-modal
              aria-labelledby="admin-skill-delete-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !deleteBusy) {
                  setDeleteName(null);
                }
              }}
            >
              <div className="w-full max-w-md overflow-hidden rounded-xl border border-border/80 bg-white shadow-2xl">
                <div className="border-b border-border/60 px-5 py-4">
                  <h3
                    id="admin-skill-delete-title"
                    className="font-display text-lg font-semibold text-foreground"
                  >
                    删除 Skill
                  </h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                    确定删除{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {deleteName}
                    </span>
                    ？将从 MySQL 与文件卷移除，不可撤销。
                  </p>
                </div>
                {deleteError ? (
                  <p className="mx-5 mt-3 rounded-lg border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-700">
                    {deleteError}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2 px-5 py-3">
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => setDeleteName(null)}
                    className="rounded-full border border-border/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => void onConfirmDelete()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
                  >
                    {deleteBusy ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    确认删除
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {editName && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
              role="dialog"
              aria-modal
              aria-labelledby="admin-skill-editor-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !editSaving) setEditName(null);
              }}
            >
              <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border/80 bg-white shadow-2xl">
                <div className="shrink-0 border-b border-border/60 px-5 py-4">
                  <h3
                    id="admin-skill-editor-title"
                    className="font-display text-lg font-semibold text-foreground"
                  >
                    编辑 SKILL.md
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {editTitle}（{editName}）
                  </p>
                  {editMeta ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {editMeta}
                    </p>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
                  {editLoading ? (
                    <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden
                      />
                      加载内容…
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <label className="block">
                        <span className="text-[11px] font-semibold text-foreground">
                          作用描述
                        </span>
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="一句话说明这个 skill 做什么（列表展示，与 SKILL.md 分离）"
                          rows={2}
                          maxLength={512}
                          className="mt-1 w-full resize-y rounded-lg border border-[hsl(var(--sand))] bg-[hsl(var(--linen)/0.35)] px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--wine-deep)/0.35)]"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-foreground">
                          SKILL.md
                        </span>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          spellCheck={false}
                          className="mt-1 min-h-[42vh] w-full resize-y rounded-lg border border-[hsl(var(--sand))] bg-[hsl(var(--linen)/0.35)] px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--wine-deep)/0.35)]"
                        />
                      </label>
                    </div>
                  )}
                  {editError ? (
                    <p className="mt-3 rounded-lg border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-700">
                      {editError}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-5 py-3">
                  <button
                    type="button"
                    disabled={editSaving}
                    onClick={() => setEditName(null)}
                    className="rounded-full border border-border/80 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/40"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={editSaving || editLoading}
                    onClick={() => void onSaveEdit()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--wine-deep))] px-4 py-2 text-xs font-semibold text-white hover:opacity-92 disabled:opacity-60"
                  >
                    {editSaving ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    保存并同步
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
