import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, Loader2, RefreshCw } from "lucide-react";
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

type AdminReviseLogsSectionProps = {
  userId: string;
};

export function AdminReviseLogsSection({ userId }: AdminReviseLogsSectionProps) {
  const [items, setItems] = useState<ChapterReviseLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <div>
            <h2 className="text-[15px] font-semibold text-[#1F2423]">
              改写指令日志
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[#59625F]">
              用户对章节草案/正式章提出的改写意见与 AI 说明（只读，供复盘分析）
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
          <p className="flex items-center gap-2 text-[13px] text-[#969E9A]">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </p>
        ) : items.length === 0 ? (
          <p className="text-[13px] text-[#969E9A]">
            暂无改写指令记录。用户在审核页点击「改写草案」后会出现在此。
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const st = statusLabel(item.status);
              const section =
                SECTION_LABELS[item.sectionId] ?? item.sectionId;
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/70 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/app/projects/${item.projectId}/knowledge`}
                          className="text-[13px] font-semibold text-[#A06358] hover:underline"
                        >
                          {item.projectName}
                        </Link>
                        <span className="text-[12px] text-[#969E9A]">·</span>
                        <span className="text-[12.5px] text-[#1F2423]">
                          {section}
                        </span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${st.className}`}
                        >
                          {st.text}
                        </span>
                      </div>
                      <p className="mt-1 text-[11.5px] text-[#969E9A]">
                        {item.userDisplayName}（{item.userId}） ·{" "}
                        {formatTime(item.createdAt)}
                        {item.runId ? (
                          <>
                            {" "}
                            ·{" "}
                            <Link
                              to={`/app/projects/${item.projectId}/knowledge/review/${item.runId}`}
                              className="text-[#A06358] hover:underline"
                            >
                              打开草案
                            </Link>
                          </>
                        ) : (
                          " · 正式章改写"
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#969E9A]">
                        用户指令
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#1F2423]">
                        {item.instruction}
                      </p>
                    </div>
                    {item.reviseNote?.trim() ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#969E9A]">
                          AI 改写说明
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#59625F]">
                          {item.reviseNote}
                        </p>
                      </div>
                    ) : null}
                    {item.error?.trim() && item.status === "failed" ? (
                      <p className="text-[12px] text-[#A06358]">
                        失败：{item.error}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
