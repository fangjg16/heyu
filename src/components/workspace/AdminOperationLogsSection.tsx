import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listAdminOperationLogs,
  type OperationLogItem,
} from "@/lib/project-api";

const CATEGORY_ORDER = [
  "user",
  "permission",
  "join",
  "llm",
  "skill",
  "file",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  user: "用户",
  permission: "项目权限",
  join: "加入审批",
  llm: "模型与密钥",
  skill: "Skills",
  file: "文件",
};

type CategoryGroup = {
  category: string;
  label: string;
  items: OperationLogItem[];
};

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

function groupByCategory(items: OperationLogItem[]): CategoryGroup[] {
  const map = new Map<string, OperationLogItem[]>();
  for (const item of items) {
    const key = item.category || "user";
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  const ordered: CategoryGroup[] = [];
  for (const key of CATEGORY_ORDER) {
    const list = map.get(key);
    if (!list?.length) continue;
    ordered.push({
      category: key,
      label: CATEGORY_LABELS[key] ?? key,
      items: list,
    });
    map.delete(key);
  }
  for (const [key, list] of map) {
    ordered.push({
      category: key,
      label: CATEGORY_LABELS[key] ?? key,
      items: list,
    });
  }
  return ordered;
}

type AdminOperationLogsSectionProps = {
  userId: string;
};

export function AdminOperationLogsSection({
  userId,
}: AdminOperationLogsSectionProps) {
  const [items, setItems] = useState<OperationLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");

  const groups = useMemo(() => groupByCategory(items), [items]);
  const selected =
    groups.find((g) => g.category === selectedId) ?? groups[0] ?? null;

  const load = async () => {
    if (!userId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listAdminOperationLogs(userId, { limit: 100 });
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
          <ClipboardList className="h-4 w-4 text-[#A06358]" strokeWidth={2} />
          <h2 className="text-[15px] font-semibold text-[#1F2423]">操作日志</h2>
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
        <p className="px-5 py-8 text-[13px] text-[#969E9A]">暂无操作记录</p>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[200px_minmax(0,1fr)]">
          <aside className="border-b border-[rgba(78,66,57,0.1)] text-left lg:border-b-0 lg:border-r">
            <ul className="max-h-[min(40vh,360px)] space-y-0.5 overflow-auto p-2 lg:max-h-[min(70vh,760px)]">
              {groups.map((g) => {
                const active = selected?.category === g.category;
                return (
                  <li key={g.category}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(g.category)}
                      className={cn(
                        "flex w-full items-start rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors",
                        active
                          ? "bg-[#EFE7E6] text-[#A06358]"
                          : "text-[#1F2423] hover:bg-[rgba(78,66,57,0.05)]",
                      )}
                    >
                      <span className="w-full truncate">{g.label}</span>
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
                  <li
                    key={item.id}
                    className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/70 px-4 py-3"
                  >
                    <p className="text-[13px] leading-relaxed text-[#1F2423]">
                      {item.summary}
                    </p>
                    <p className="mt-1 text-[11.5px] text-[#969E9A]">
                      {item.actorDisplayName}（{item.actorUserId}） ·{" "}
                      {formatTime(item.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
