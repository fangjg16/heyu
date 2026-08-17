import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getGenerateSystemPrompt,
  listKnChapterTemplates,
  reviseKnChapterTemplate,
  saveGenerateSystemPrompt,
  saveKnChapterTemplate,
  type KnChapterTemplate,
} from "@/lib/admin-kn-templates-api";

type GroupBlock = {
  groupId: string;
  groupLabel: string;
  items: KnChapterTemplate[];
};

const PREVIEW_PANE =
  "kn-chapter-html max-h-[min(48vh,520px)] overflow-auto text-[13px] leading-[1.65] text-[#1F2423] [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[rgba(78,66,57,0.12)] [&_td]:px-3 [&_td]:py-2.5 [&_th]:border [&_th]:border-[rgba(78,66,57,0.12)] [&_th]:bg-[rgba(78,66,57,0.05)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[12px]";

/** 去掉 YAML frontmatter，得到可预览的 HTML 正文 */
function stripFrontmatter(markdown: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/u.exec(markdown);
  return (m?.[1] ?? markdown).trim();
}

export function AdminKnTemplatesSection() {
  const [templates, setTemplates] = useState<KnChapterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [savedMarkdown, setSavedMarkdown] = useState("");
  const [draftHint, setDraftHint] = useState("");
  const [savedHint, setSavedHint] = useState("");
  const [instruction, setInstruction] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [reviseBusy, setReviseBusy] = useState(false);

  const [systemOpen, setSystemOpen] = useState(false);
  const [draftSystem, setDraftSystem] = useState("");
  const [savedSystem, setSavedSystem] = useState("");
  const [systemMeta, setSystemMeta] = useState<string>("");
  const [systemBusy, setSystemBusy] = useState(false);
  const [mdView, setMdView] = useState<"source" | "preview">("source");

  const chapterDirty =
    draftMarkdown !== savedMarkdown || draftHint !== savedHint;
  const systemDirty = draftSystem !== savedSystem;
  const busy = saveBusy || reviseBusy || systemBusy;
  const previewHtml = useMemo(
    () => stripFrontmatter(draftMarkdown),
    [draftMarkdown],
  );

  const groups = useMemo(() => {
    const map = new Map<string, GroupBlock>();
    for (const t of templates) {
      const key = t.groupId || t.groupLabel || "other";
      let block = map.get(key);
      if (!block) {
        block = {
          groupId: t.groupId,
          groupLabel: t.groupLabel || "其他",
          items: [],
        };
        map.set(key, block);
      }
      block.items.push(t);
    }
    return Array.from(map.values());
  }, [templates]);

  const selected =
    templates.find((t) => t.id === selectedId) ?? templates[0] ?? null;

  const applyTemplate = (t: KnChapterTemplate) => {
    setSelectedId(t.id);
    setDraftMarkdown(t.markdown);
    setSavedMarkdown(t.markdown);
    setDraftHint(t.formatHint ?? "");
    setSavedHint(t.formatHint ?? "");
    setInstruction("");
    setMdView("source");
  };

  const load = async (opts?: { keepSelection?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const [rows, sys] = await Promise.all([
        listKnChapterTemplates(),
        getGenerateSystemPrompt().catch(() => null),
      ]);
      setTemplates(rows);
      if (sys) {
        if (!(opts?.keepSelection && systemDirty)) {
          setDraftSystem(sys.value);
          setSavedSystem(sys.value);
        }
        setSystemMeta(
          [
            sys.updatedAt ? `更新于 ${sys.updatedAt}` : null,
            sys.updatedBy,
            sys.empty ? "（空，生成时用代码默认）" : null,
          ]
            .filter(Boolean)
            .join(" · "),
        );
      }
      if (rows.length === 0) {
        setSelectedId("");
        setDraftMarkdown("");
        setSavedMarkdown("");
        setDraftHint("");
        setSavedHint("");
        return;
      }
      const preferId = opts?.keepSelection ? selectedId : "";
      const next =
        (preferId ? rows.find((r) => r.id === preferId) : null) ?? rows[0]!;
      if (opts?.keepSelection && next.id === selectedId && chapterDirty) {
        return;
      }
      applyTemplate(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载模板失败");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首次拉取
  }, []);

  const selectTemplate = (id: string) => {
    if (id === selectedId) return;
    if (chapterDirty) {
      if (!window.confirm("当前修改未保存，切换章节将丢弃。确定继续？")) {
        return;
      }
    }
    const t = templates.find((x) => x.id === id);
    if (t) applyTemplate(t);
  };

  const onCancel = () => {
    setDraftMarkdown(savedMarkdown);
    setDraftHint(savedHint);
    setError(null);
    setNotice(null);
  };

  const onSave = async () => {
    if (!selected || busy) return;
    if (!draftMarkdown.trim()) {
      setError("模板内容不能为空");
      return;
    }
    setSaveBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await saveKnChapterTemplate(selected.id, {
        markdown: draftMarkdown,
        formatHint: draftHint.trim() ? draftHint : null,
      });
      setTemplates((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
      setDraftMarkdown(updated.markdown);
      setSavedMarkdown(updated.markdown);
      setDraftHint(updated.formatHint ?? "");
      setSavedHint(updated.formatHint ?? "");
      setNotice("模板与章节提示词已保存（立即生效）");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaveBusy(false);
    }
  };

  const onSaveSystem = async () => {
    if (busy || !draftSystem.trim()) {
      setError("全局 System 提示词不能为空");
      return;
    }
    setSystemBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveGenerateSystemPrompt(draftSystem);
      setDraftSystem(saved.value);
      setSavedSystem(saved.value);
      setSystemMeta(
        [
          saved.updatedAt ? `更新于 ${saved.updatedAt}` : null,
          saved.updatedBy,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      setNotice("全局生成 System 提示词已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存全局提示词失败");
    } finally {
      setSystemBusy(false);
    }
  };

  const onRevise = async () => {
    if (!selected || busy) return;
    const text = instruction.trim();
    if (!text) return;
    if (chapterDirty) {
      if (
        !window.confirm(
          "改写只更新 MD 模板，并基于已保存内容；未保存的手改会被丢弃。确定继续？",
        )
      ) {
        return;
      }
    }
    setReviseBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (chapterDirty) {
        setDraftMarkdown(savedMarkdown);
        setDraftHint(savedHint);
      }
      const updated = await reviseKnChapterTemplate(selected.id, text);
      setTemplates((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
      setDraftMarkdown(updated.markdown);
      setSavedMarkdown(updated.markdown);
      setDraftHint(updated.formatHint ?? savedHint);
      setSavedHint(updated.formatHint ?? savedHint);
      setInstruction("");
      setNotice("MD 模板已按指令改写并保存（章节提示词未改）");
    } catch (e) {
      setError(e instanceof Error ? e.message : "改写失败");
    } finally {
      setReviseBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[18px] border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.82)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(78,66,57,0.1)] px-5 py-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#A06358]" strokeWidth={2} />
          <div>
            <h2 className="text-[15px] font-semibold text-[#1F2423]">
              知识网络章节 MD 与提示词
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[#59625F]">
              编辑全局 System、每章专用提示词与 MD
              骨架。保存后立即作用于「更新本章」，无版本。
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load({ keepSelection: true })}
          disabled={loading || busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgba(78,66,57,0.18)] px-3 text-[12.5px] font-medium text-[#1F2423] hover:bg-[rgba(78,66,57,0.04)] disabled:opacity-45"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          刷新
        </button>
      </div>

      {error ? (
        <p className="mx-5 mt-4 rounded-xl border border-[rgba(160,99,88,0.25)] bg-[rgba(160,99,88,0.06)] px-3.5 py-2 text-[12.5px] text-[#A06358]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mx-5 mt-4 rounded-xl border border-[rgba(94,155,117,0.28)] bg-[rgba(94,155,117,0.08)] px-3.5 py-2 text-[12.5px] text-[#2F6B4F]">
          {notice}
        </p>
      ) : null}

      <div className="border-b border-[rgba(78,66,57,0.08)] px-5 py-3">
        <button
          type="button"
          onClick={() => setSystemOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 text-left text-[13px] font-semibold text-[#1F2423]"
        >
          {systemOpen ? (
            <ChevronDown className="h-4 w-4 text-[#969E9A]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[#969E9A]" />
          )}
          全局生成 System 提示词
          {systemDirty ? (
            <span className="ml-2 text-[12px] font-normal text-[#8A6218]">
              未保存
            </span>
          ) : null}
        </button>
        {systemOpen ? (
          <div className="mt-3 space-y-2">
            {systemMeta ? (
              <p className="text-[11.5px] text-[#969E9A]">{systemMeta}</p>
            ) : null}
            <textarea
              value={draftSystem}
              onChange={(e) => setDraftSystem(e.target.value)}
              disabled={busy}
              spellCheck={false}
              rows={10}
              className="w-full resize-y rounded-xl border border-[rgba(78,66,57,0.12)] bg-white/90 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[#1F2423] outline-none focus:border-[rgba(160,99,88,0.35)] disabled:opacity-60"
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setDraftSystem(savedSystem);
                }}
                disabled={!systemDirty || busy}
                className="h-8 rounded-md border border-[rgba(78,66,57,0.18)] px-3 text-[12px] font-medium text-[#1F2423] disabled:opacity-45"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void onSaveSystem()}
                disabled={!systemDirty || busy}
                className="h-8 rounded-md bg-[#A06358] px-3 text-[12px] font-medium text-white hover:bg-[#8F564C] disabled:opacity-45"
              >
                {systemBusy ? "保存中…" : "保存全局 System"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {loading && templates.length === 0 ? (
        <div className="flex min-h-[36vh] items-center justify-center text-sm text-[#969E9A]">
          加载模板…
        </div>
      ) : templates.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-[#969E9A]">
          暂无模板。请确认已执行 migration 0017/0020 并 seed:kn-chapter-templates。
        </div>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border-b border-[rgba(78,66,57,0.1)] text-left lg:border-b-0 lg:border-r">
            <div className="max-h-[min(70vh,760px)] overflow-auto p-2">
              {groups.map((g) => (
                <div key={g.groupId || g.groupLabel} className="mb-2">
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[#969E9A]">
                    {g.groupLabel}
                  </div>
                  <ul className="space-y-0.5 pl-1">
                    {g.items.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => selectTemplate(t.id)}
                          disabled={busy}
                          className={cn(
                            "flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-60",
                            selectedId === t.id
                              ? "bg-[#EFE7E6] font-semibold text-[#A06358]"
                              : "text-[#1F2423] hover:bg-[rgba(78,66,57,0.05)]",
                          )}
                        >
                          <span className="w-full truncate text-[12.5px]">
                            {t.title}
                          </span>
                          <span className="w-full truncate text-[11px] font-normal text-[#969E9A]">
                            {t.id}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </aside>

          <div className="flex min-w-0 flex-col">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[rgba(78,66,57,0.08)] px-4 py-3">
                  <div>
                    <div className="text-[14px] font-semibold text-[#1F2423]">
                      {selected.title}
                      {chapterDirty ? (
                        <span className="ml-2 text-[12px] font-normal text-[#8A6218]">
                          未保存
                        </span>
                      ) : null}
                      {reviseBusy ? (
                        <span className="ml-2 text-[12px] font-normal text-[#8A6218]">
                          改写中…
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[12px] text-[#969E9A]">
                      最近更新：{selected.updatedAt || "—"}
                      {selected.updatedBy
                        ? ` · ${selected.updatedBy}`
                        : ""}
                      {selected.kicker ? ` · ${selected.kicker}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={onCancel}
                      disabled={!chapterDirty || busy}
                      className="h-8 rounded-md border border-[rgba(78,66,57,0.18)] px-3 text-[12px] font-medium text-[#1F2423] disabled:opacity-45"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void onSave()}
                      disabled={!chapterDirty || busy}
                      className="h-8 rounded-md bg-[#A06358] px-3 text-[12px] font-medium text-white hover:bg-[#8F564C] disabled:opacity-45"
                    >
                      {saveBusy ? "保存中…" : "保存本章"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-2 border-b border-[rgba(78,66,57,0.08)] px-4 py-3">
                  <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    rows={2}
                    disabled={busy}
                    placeholder="改写指令仅作用于 MD 模板，例如：在财务表增加一列「口径说明」"
                    className="min-h-[48px] min-w-[220px] flex-1 resize-y rounded-xl border border-[rgba(78,66,57,0.12)] bg-white/80 px-3 py-2 text-[13px] leading-relaxed text-[#1F2423] outline-none placeholder:text-[#969E9A] focus:border-[rgba(160,99,88,0.35)] disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => void onRevise()}
                    disabled={busy || !instruction.trim()}
                    className="h-10 shrink-0 rounded-[9px] bg-[#A06358] px-4 text-[13px] font-medium text-white hover:bg-[#8F564C] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {reviseBusy ? "改写中…" : "改写 MD"}
                  </button>
                </div>

                <div className="space-y-4 p-4">
                  <div>
                    <div className="mb-1.5 text-[12px] font-semibold text-[#59625F]">
                      章节专用提示词（formatHint）
                    </div>
                    <textarea
                      value={draftHint}
                      onChange={(e) => setDraftHint(e.target.value)}
                      disabled={busy}
                      spellCheck={false}
                      rows={5}
                      placeholder="留空则生成时回退代码内默认版式说明"
                      className="w-full resize-y rounded-xl border border-[rgba(78,66,57,0.12)] bg-white/90 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[#1F2423] outline-none focus:border-[rgba(160,99,88,0.35)] disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[12px] font-semibold text-[#59625F]">
                        章节 MD 模板
                      </div>
                      <div className="inline-flex rounded-lg bg-[rgba(78,66,57,0.07)] p-0.5">
                        {(
                          [
                            ["source", "源码"],
                            ["preview", "预览"],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setMdView(id)}
                            className={cn(
                              "h-7 rounded-md px-3 text-[12px] font-medium",
                              mdView === id
                                ? "bg-[#1F2423] text-white"
                                : "text-[#59625F]",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {mdView === "source" ? (
                      <textarea
                        value={draftMarkdown}
                        onChange={(e) => setDraftMarkdown(e.target.value)}
                        disabled={busy}
                        spellCheck={false}
                        className="min-h-[min(48vh,520px)] w-full resize-y rounded-xl border border-[rgba(78,66,57,0.12)] bg-white/90 px-3 py-3 font-mono text-[12.5px] leading-relaxed text-[#1F2423] outline-none focus:border-[rgba(160,99,88,0.35)] disabled:opacity-60"
                      />
                    ) : (
                      <div className="min-h-[min(48vh,520px)] rounded-xl border border-[rgba(78,66,57,0.12)] bg-white/90 p-3">
                        {previewHtml ? (
                          <div
                            className={PREVIEW_PANE}
                            dangerouslySetInnerHTML={{ __html: previewHtml }}
                          />
                        ) : (
                          <p className="text-[12.5px] text-[#969E9A]">
                            （去掉 frontmatter 后无可预览内容）
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="p-6 text-[13px] text-[#969E9A]">请选择章节</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
