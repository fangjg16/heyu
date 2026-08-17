import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, History, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listAdminChapterReviseLogs,
  type ChapterReviseLogItem,
} from "@/lib/project-api";

const SECTION_LABELS: Record<string, string> = {
  "project-overview": "项目概览",
  snapshot: "项目快照",
  objectives: "标的概况",
  industry: "行业分析",
  legal: "合规分析",
  benchmarks: "对标分析",
  business: "业务模式",
  returns: "财务与回报",
  capabilities: "资源网络",
  ownership: "背景调查",
  diligence: "尽职调查",
  risks: "风险矩阵",
  questions: "待确认问题",
  framework: "决策路径与法律结构",
};

type ProjectGroup = {
  projectId: string;
  projectName: string;
  items: ChapterReviseLogItem[];
};

function statusLabel(status: string): { text: string; className: string } {
  if (status === "pending") {
    return {
      text: "进行中",
      className: "bg-[rgba(176,125,31,0.12)] text-[#8A6218]",
    };
  }
  if (status === "ok") {
    return {
      text: "成功",
      className: "bg-[rgba(47,107,79,0.12)] text-[#2F6B4F]",
    };
  }
  if (status === "failed") {
    return {
      text: "失败",
      className: "bg-[rgba(160,99,88,0.12)] text-[#A06358]",
    };
  }
  return {
    text: status,
    className: "bg-[rgba(78,66,57,0.08)] text-[#59625F]",
  };
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function previewText(raw: string, max = 72): string {
  const one = raw.replace(/\s+/gu, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max)}…`;
}

function groupByProject(items: ChapterReviseLogItem[]): ProjectGroup[] {
  const map = new Map<string, ProjectGroup>();
  for (const item of items) {
    const key = item.projectId || "_unknown";
    let group = map.get(key);
    if (!group) {
      group = {
        projectId: item.projectId,
        projectName: item.projectName?.trim() || item.projectId,
        items: [],
      };
      map.set(key, group);
    }
    group.items.push(item);
  }
  for (const group of map.values()) {
    group.items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  return Array.from(map.values()).sort((a, b) => {
    const aLatest = a.items[0]?.createdAt ?? "";
    const bLatest = b.items[0]?.createdAt ?? "";
    return aLatest < bLatest ? 1 : -1;
  });
}

function LogCard({ item }: { item: ChapterReviseLogItem }) {
  const [open, setOpen] = useState(false);
  const st = statusLabel(item.status);
  const section = SECTION_LABELS[item.sectionId] ?? item.sectionId;

  return (
    <li className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-[#969E9A]" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#969E9A]" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-[#1F2423]">
              {section}
            </span>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${st.className}`}
            >
              {st.text}
            </span>
          </span>
          <span className="mt-1 block text-[11.5px] text-[#969E9A]">
            {item.userDisplayName}（{item.userId}） · {formatTime(item.createdAt)}
            {item.runId ? " · 草案" : " · 正式章"}
          </span>
          {open ? null : (
            <span className="mt-1.5 block text-[12.5px] leading-relaxed text-[#59625F]">
              {previewText(item.instruction)}
            </span>
          )}
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-[rgba(78,66,57,0.08)] px-4 py-3 pl-10">
          {item.runId ? (
            <Link
              to={`/app/projects/${item.projectId}/knowledge/review/${item.runId}`}
              className="text-[12.5px] font-medium text-[#A06358] hover:underline"
            >
              打开草案
            </Link>
          ) : (
            <Link
              to={`/app/projects/${item.projectId}/knowledge`}
              className="text-[12.5px] font-medium text-[#A06358] hover:underline"
            >
              打开知识网络
            </Link>
          )}
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-[#969E9A]">
              用户指令
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#1F2423]">
              {item.instruction}
            </p>
          </div>
          {item.reviseNote?.trim() ? (
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-[#969E9A]">
                AI 改写说明
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#59625F]">
                {item.reviseNote}
              </p>
            </div>
          ) : null}
          {item.error?.trim() && item.status === "failed" ? (
            <p className="text-[12px] text-[#A06358]">失败：{item.error}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

type AdminReviseLogsSectionProps = {
  userId: string;
};

export function AdminReviseLogsSection({ userId }: AdminReviseLogsSectionProps) {
  const [items, setItems] = useState<ChapterReviseLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");

  const groups = useMemo(() => groupByProject(items), [items]);
  const selected =
    groups.find((g) => g.projectId === selectedId) ?? groups[0] ?? null;

  const load = async () => {
    if (!userId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listAdminChapterReviseLogs(userId, { limit: 100 });
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随 userId 拉取
  }, [userId]);

  return (
    <div className="overflow-hidden rounded-[18px] border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.82)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(78,66,57,0.1)] px-5 py-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-[#A06358]" strokeWidth={2} />
          <h2 className="text-[15px] font-semibold text-[#1F2423]">
            改写指令日志
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-[rgba(78,66,57,0.18)] px-3 text-[12.5px] font-medium text-[#1F2423] hover:bg-[rgba(78,66,57,0.04)] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          刷新
        </button>
      </div>

      {error ? (
        <p className="mx-5 mt-4 rounded-xl border border-[rgba(160,99,88,0.25)] bg-[rgba(160,99,88,0.06)] px-3.5 py-2 text-[12.5px] text-[#A06358]">
          {error}
        </p>
      ) : null}

      {loading && items.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-8 text-[13px] text-[#969E9A]">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </p>
      ) : items.length === 0 ? (
        <p className="px-5 py-8 text-[13px] text-[#969E9A]">
          暂无改写指令记录。用户在审核页点击「改写草案」后会出现在此。
        </p>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border-b border-[rgba(78,66,57,0.1)] text-left lg:border-b-0 lg:border-r">
            <div className="px-3 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[#969E9A]">
              项目
            </div>
            <ul className="max-h-[min(40vh,360px)] space-y-0.5 overflow-auto p-2 lg:max-h-[min(70vh,760px)]">
              {groups.map((g) => {
                const active = selected?.projectId === g.projectId;
                return (
                  <li key={g.projectId}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(g.projectId)}
                      className={cn(
                        "flex w-full items-start rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors",
                        active
                          ? "bg-[#EFE7E6] text-[#A06358]"
                          : "text-[#1F2423] hover:bg-[rgba(78,66,57,0.05)]",
                      )}
                    >
                      <span className="w-full truncate">{g.projectName}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="min-w-0 px-5 py-4">
            {selected ? (
              <ul className="space-y-2">
                {selected.items.map((item) => (
                  <LogCard key={item.id} item={item} />
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
