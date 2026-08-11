import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FilePenLine, Loader2, RefreshCw } from "lucide-react";
import {
  listMyChapterDraftRuns,
  type MyChapterDraftRunItem,
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

function scopeLabel(item: MyChapterDraftRunItem): string {
  if (item.scope === "section") {
    const sid = item.researchSectionIds[0];
    if (sid === "project-overview") return "项目概览";
    const name = sid ? (SECTION_LABELS[sid] ?? sid) : "单章";
    return `单章 · ${name}`;
  }
  return "全部章节";
}

function statusLabel(status: string): { text: string; className: string } {
  if (status === "generating") {
    return {
      text: "生成中",
      className: "bg-[rgba(176,125,31,0.12)] text-[#8A6218]",
    };
  }
  if (status === "ready") {
    return {
      text: "待审核",
      className: "bg-[rgba(160,99,88,0.1)] text-[#A06358]",
    };
  }
  return {
    text: status,
    className: "bg-[rgba(78,66,57,0.08)] text-[#59625F]",
  };
}

type AdminDraftsSectionProps = {
  userId: string;
};

export function AdminDraftsSection({ userId }: AdminDraftsSectionProps) {
  const [items, setItems] = useState<MyChapterDraftRunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!userId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listMyChapterDraftRuns(userId);
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
          <FilePenLine className="h-4 w-4 text-[#A06358]" strokeWidth={2} />
          <div>
            <h2 className="text-[15px] font-semibold text-[#1F2423]">
              知识网络更新草案
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[#59625F]">
              可见项目下进行中的章节更新草案（生成中 / 待审核）
            </p>
          </div>
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

      <div className="px-5 py-4">
        {error ? (
          <p className="mb-3 rounded-xl border border-[rgba(160,99,88,0.25)] bg-[rgba(160,99,88,0.06)] px-3.5 py-2 text-[12.5px] text-[#A06358]">
            {error}
          </p>
        ) : null}

        {loading && items.length === 0 ? (
          <div className="flex min-h-[160px] items-center justify-center text-[13px] text-[#969E9A]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={2} />
            加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[160px] items-center justify-center px-4 py-10">
            <p className="text-center text-[13px] text-[#969E9A]">
              暂无进行中的更新草案。在项目知识网络发起「更新全部章节」或「更新本章」后会出现在此。
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[rgba(78,66,57,0.08)]">
            {items.map((item) => {
              const st = statusLabel(item.status);
              return (
                <li
                  key={item.runId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-[#1F2423]">
                        {item.projectName}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${st.className}`}
                      >
                        {st.text}
                      </span>
                      <span className="shrink-0 rounded bg-[rgba(78,66,57,0.07)] px-1.5 py-0.5 text-[11px] text-[#59625F]">
                        {scopeLabel(item)}
                      </span>
                    </div>
                    <p className="mt-1 text-[12.5px] text-[#59625F]">
                      进度 {item.progressDone}/{item.progressTotal}
                      {item.failedCount > 0
                        ? ` · 失败 ${item.failedCount}`
                        : ""}
                      {item.createdBy ? ` · ${item.createdBy}` : ""}
                      {item.createdAt
                        ? ` · ${new Date(item.createdAt).toLocaleString("zh-CN")}`
                        : ""}
                    </p>
                  </div>
                  <Link
                    to={`/app/projects/${encodeURIComponent(item.projectId)}/knowledge/review/${encodeURIComponent(item.runId)}`}
                    className="inline-flex h-9 shrink-0 items-center rounded-[9px] bg-[#A06358] px-3.5 text-[12.5px] font-medium text-white hover:bg-[#8F564C]"
                  >
                    进入审核
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
