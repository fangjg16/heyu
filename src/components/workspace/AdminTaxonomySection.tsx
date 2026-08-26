import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchAdminSkillContent,
  saveAdminSkillContent,
  syncOneAdminSkill,
} from "@/lib/admin-skills-api";
import { parseTaxonomyMarkdown } from "@/workspace/parse-taxonomy-markdown";

const SKILL_NAME = "classify-investment-theme";
const TAXONOMY_PATH = "references/taxonomy.md";

export function AdminTaxonomySection() {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);

  const parsed = useMemo(() => parseTaxonomyMarkdown(draft), [draft]);
  const dirty = draft !== saved;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const data = await fetchAdminSkillContent(SKILL_NAME);
      const file = data.files.find((f) => f.path === TAXONOMY_PATH);
      const content = file?.content ?? "";
      if (!content.trim()) {
        setError(
          `未找到 ${SKILL_NAME}/${TAXONOMY_PATH}。请先在 Hermes Skills 中导入该 skill。`,
        );
      }
      setDraft(content);
      setSaved(content);
      setMeta(
        [
          data.title,
          data.syncStatus ? `同步 ${data.syncStatus}` : null,
          data.syncedAt ? `最近同步 ${data.syncedAt}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载 taxonomy.md 失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!dirty || saving) return;
    if (parsed.themes.length === 0) {
      setError("当前 Markdown 解析不出任何一级分类，请检查 ## 1. 标题格式后再保存。");
      return;
    }
    setSaving(true);
    setError(null);
    setHint(null);
    try {
      const result = await saveAdminSkillContent(SKILL_NAME, {
        files: [{ path: TAXONOMY_PATH, content: draft }],
      });
      setSaved(draft);
      const sync = await syncOneAdminSkill(SKILL_NAME).catch(() => null);
      setHint(
        [
          `已保存 ${parsed.themes.length} 个一级分类。`,
          result.syncWarning,
          result.hint,
          sync && !sync.ok ? sync.syncWarning : null,
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">行业分类白名单</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            编辑 <code className="text-[12px]">classify-investment-theme/references/taxonomy.md</code>
            。项目创建/编辑的一二级下拉会读取这份文件；也可在表单里手动输入白名单之外的分类。
          </p>
          {meta ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{meta}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            重新加载
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving || loading}
            className="inline-flex h-9 items-center rounded-lg bg-[hsl(var(--wine))] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存 taxonomy.md"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
          {hint}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载 taxonomy.md…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="min-h-[min(70vh,720px)] w-full resize-y rounded-xl border border-border/80 bg-white px-4 py-3 font-mono text-[12.5px] leading-relaxed text-foreground"
            aria-label="taxonomy.md"
          />
          <div className="rounded-xl border border-border/70 bg-[rgba(255,252,248,0.8)] px-4 py-3">
            <p className="text-[12px] font-medium text-foreground">解析预览</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              版本 {parsed.version || "—"} · {parsed.themes.length} 个一级分类
            </p>
            <ul className="mt-3 max-h-[min(62vh,640px)] space-y-2 overflow-y-auto text-[12px]">
              {parsed.themes.map((item) => (
                <li key={item.theme}>
                  <span className="font-medium text-foreground">{item.theme}</span>
                  <span className="ml-1 text-muted-foreground">
                    {item.sectors.length} 个二级
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
