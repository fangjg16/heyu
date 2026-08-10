import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export type ProjectGraphNode = {
  id: string;
  label: string;
  kind: string;
  type?: string;
  status?: string;
  x?: number;
  y?: number;
  summary?: string;
  section?: string;
  evidenceRefs?: string[];
};

export type ProjectGraphEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  status?: string;
};

export type ProjectGraphData = {
  coverageTitle?: string;
  coverageText?: string;
  filters?: string[];
  legend?: { label: string; color: string }[];
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  candidates?: { text: string; src?: string }[];
};

type ProjectRelationGraphProps = {
  data: ProjectGraphData;
  projectId: string;
};

function statusDot(node: ProjectGraphNode): string {
  if (node.type === "project") return "rgba(255,255,255,0.92)";
  if (node.status === "conflict") return "#A3262C";
  if (node.status === "unverified") return "#D59A2F";
  if (node.kind === "方案") return "#8B1F24";
  return "#3F6F63";
}

function statusText(status?: string): string {
  const map: Record<string, string> = {
    verified: "已核实",
    claimed: "当事方声明",
    inferred: "研究推论",
    unverified: "待确认",
    conflict: "存在反证",
  };
  return (status && map[status]) || "待确认";
}

function GraphNodeDrawer({
  node,
  edges,
  nodeById,
  projectId,
  onClose,
}: {
  node: ProjectGraphNode;
  edges: ProjectGraphEdge[];
  nodeById: Record<string, ProjectGraphNode | undefined>;
  projectId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const evidenceCount = node.evidenceRefs?.length ?? 0;
  const linkedSection = (node.section ?? "").trim() || "snapshot";
  const related = edges
    .filter((e) => e.from === node.id || e.to === node.id)
    .map((e) => {
      const otherId = e.from === node.id ? e.to : e.from;
      const other = nodeById[otherId];
      return {
        id: e.id,
        label: other
          ? `${e.label ? `${e.label} · ` : ""}${other.label}`
          : e.label || otherId,
        color:
          e.status === "conflict"
            ? "#A3262C"
            : e.status === "unverified" || e.status === "inferred"
              ? "#D59A2F"
              : "#5E9B75",
      };
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const goKnowledge = () => {
    onClose();
    navigate(
      `/app/projects/${encodeURIComponent(projectId)}/knowledge?section=${encodeURIComponent(linkedSection)}`,
    );
  };

  const goChat = () => {
    onClose();
    navigate(`/app/chat/${encodeURIComponent(projectId)}`);
  };

  return createPortal(
    <>
      <button
        type="button"
        aria-label="关闭"
        className="fixed inset-0 z-[160] border-0 bg-[rgba(31,36,35,0.28)] p-0"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="graph-node-drawer-title"
        className="fixed inset-y-0 right-0 z-[161] flex w-[440px] max-w-[92vw] flex-col bg-[#FCFAF6] shadow-[-14px_0_40px_rgba(102,80,60,0.18)] animate-in slide-in-from-right fade-in duration-200"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(78,66,57,0.1)] px-6 py-5">
          <div className="min-w-0">
            <div className="text-[11.5px] font-medium text-[#A3262C]">
              项目关系 · {node.kind || "节点"}
            </div>
            <h2
              id="graph-node-drawer-title"
              className="mt-1 font-[family-name:var(--font-serif,serif)] text-[18px] font-semibold leading-snug text-[#1F2423]"
            >
              {node.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-[18px] text-[#59625F] hover:bg-[rgba(78,66,57,0.08)]"
            aria-label="关闭抽屉"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg bg-[rgba(94,155,117,0.14)] px-[11px] py-1 text-[11px] font-medium text-[#3F6F63]">
              关联证据 {evidenceCount} 条
            </span>
            <span
              className={cn(
                "rounded-lg px-[11px] py-1 text-[11px] font-medium",
                node.status === "conflict"
                  ? "bg-[#F7EDEE] text-[#A3262C]"
                  : "bg-[rgba(78,66,57,0.08)] text-[#59625F]",
              )}
            >
              {statusText(node.status)}
            </span>
          </div>

          <div>
            <div className="mb-1.5 text-[11.5px] text-[#59625F]">摘要</div>
            <div className="text-[13.5px] leading-[1.65] text-[#1F2423]">
              {node.summary?.trim() || "暂无摘要"}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11.5px] text-[#59625F]">核验状态</div>
            <div className="text-[13.5px] leading-[1.65] text-[#1F2423]">
              {statusText(node.status)}
            </div>
          </div>

          {related.length > 0 ? (
            <div className="rounded-xl border border-[rgba(78,66,57,0.08)] bg-[rgba(248,243,238,0.7)] px-4 py-3.5">
              <div className="mb-2.5 text-[11.5px] text-[#59625F]">关联对象</div>
              <div className="flex flex-col gap-2">
                {related.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-2 text-[12.5px] text-[#1F2423]"
                  >
                    <span className="min-w-0">
                      <span style={{ color: l.color }}>●</span> {l.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={goKnowledge}
            className="flex items-center justify-between rounded-lg text-left text-[12.5px] text-[#1F2423] transition-colors hover:text-[#A3262C]"
          >
            <span>
              <span className="text-[#A3262C]">●</span> 跳转到关联研究内容
            </span>
            <span className="text-[11px] text-[#A3262C]">查看 →</span>
          </button>
        </div>

        <div className="flex gap-2.5 border-t border-[rgba(78,66,57,0.1)] px-6 py-4">
          <button
            type="button"
            onClick={goChat}
            className="h-[42px] flex-1 rounded-[11px] border border-[rgba(78,66,57,0.16)] bg-transparent text-[13px] font-medium text-[#1F2423]"
          >
            在对话中追问
          </button>
          <button
            type="button"
            onClick={goKnowledge}
            className="h-[42px] flex-1 rounded-[11px] border-none bg-[#A3262C] text-[13px] font-medium text-white"
          >
            查看关联章节 →
          </button>
        </div>
      </aside>
    </>,
    document.body,
  );
}

export function ProjectRelationGraph({
  data,
  projectId,
}: ProjectRelationGraphProps) {
  const [filter, setFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const filterOptions = useMemo(
    () => ["全部", ...(data.filters ?? [])],
    [data.filters],
  );

  const { visibleNodes, visibleEdges, nodeById } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = data.nodes.filter((node) => {
      const filterMatch = filter === "全部" || node.kind === filter;
      const queryMatch =
        !q ||
        [node.label, node.kind, node.summary ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q);
      return filterMatch && queryMatch;
    });
    const ids = new Set(matches.map((n) => n.id));
    if ((filter !== "全部" || q) && matches.length) {
      const root = data.nodes.find(
        (n) => n.type === "project" || n.type === "entity",
      );
      if (root) ids.add(root.id);
    }
    const visibleNodes = data.nodes.filter((n) => ids.has(n.id));
    const nodeById = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
    const visibleEdges = data.edges.filter(
      (e) => ids.has(e.from) && ids.has(e.to),
    );
    return { visibleNodes, visibleEdges, nodeById };
  }, [data, filter, query]);

  const active = activeId
    ? (data.nodes.find((n) => n.id === activeId) ?? null)
    : null;

  return (
    <section className="mt-8 border-t border-[rgba(78,66,57,0.12)] pt-7">
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-[family-name:var(--font-serif,serif)] text-[21px] font-semibold text-[#1F2423]">
            项目关系图
          </h2>
          <p className="mt-1 text-[12px] text-[#59625F]">
            {data.nodes.length} 个节点 · {data.edges.length} 条关系 ·
            点击节点查看详情
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索实体、关系或摘要"
          className="h-[34px] w-[210px] rounded-[9px] border border-[rgba(78,66,57,0.14)] bg-[rgba(255,252,248,0.82)] px-2.5 text-[12.5px] text-[#1F2423] outline-none"
        />
        {filterOptions.map((f) => {
          const activeFilter = f === filter;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "h-[34px] rounded-[9px] border px-3.5 text-[12.5px]",
                activeFilter
                  ? "border-[rgba(163,38,44,0.3)] bg-[#F7EDEE] text-[#A3262C]"
                  : "border-[rgba(78,66,57,0.14)] bg-[rgba(255,252,248,0.6)] text-[#59625F]",
              )}
            >
              {f === "全部" ? "全部实体" : f}
            </button>
          );
        })}
        <div className="ml-auto text-[11.5px] text-[#59625F]">
          当前显示 {visibleNodes.length} 个节点 · {visibleEdges.length} 条关系
        </div>
      </div>

      <div className="relative h-[500px] overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.78)]">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {visibleEdges.map((e) => {
            const from = nodeById[e.from];
            const to = nodeById[e.to];
            if (!from || !to) return null;
            const conflict = e.status === "conflict";
            const dashed =
              e.status === "inferred" || e.status === "unverified";
            return (
              <line
                key={e.id}
                x1={from.x ?? 50}
                y1={from.y ?? 50}
                x2={to.x ?? 50}
                y2={to.y ?? 50}
                stroke={
                  conflict ? "rgba(163,38,44,0.42)" : "rgba(78,66,57,0.27)"
                }
                strokeWidth={conflict ? 0.48 : 0.32}
                strokeDasharray={dashed ? "1.4 1.1" : undefined}
              />
            );
          })}
        </svg>

        {visibleEdges.map((e) => {
          const from = nodeById[e.from];
          const to = nodeById[e.to];
          if (!from || !to || !e.label) return null;
          const left = ((from.x ?? 50) + (to.x ?? 50)) / 2;
          const top = ((from.y ?? 50) + (to.y ?? 50)) / 2;
          return (
            <div
              key={`${e.id}-label`}
              className="pointer-events-none absolute z-[1] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[rgba(246,243,238,0.92)] px-1.5 py-px text-[10px] text-[#7d756b]"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              {e.label}
            </div>
          );
        })}

        {visibleNodes.map((node) => {
          const main = node.type === "project";
          const selected = activeId === node.id;
          const border =
            node.status === "conflict"
              ? "rgba(163,38,44,0.45)"
              : node.status === "unverified"
                ? "rgba(213,154,47,0.48)"
                : "rgba(63,111,99,0.4)";
          const bg = main
            ? "#A3262C"
            : node.status === "conflict"
              ? "#F9EEEE"
              : "rgba(255,252,248,0.96)";
          return (
            <button
              key={node.id}
              type="button"
              title={node.summary || node.label}
              onClick={() => setActiveId(node.id)}
              className="absolute z-[2] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-xl border shadow-[0_5px_16px_rgba(102,80,60,0.1)]"
              style={{
                left: `${node.x ?? 50}%`,
                top: `${node.y ?? 50}%`,
                background: bg,
                borderColor: selected
                  ? "rgba(163,38,44,0.65)"
                  : main
                    ? "transparent"
                    : border,
                borderWidth: main && !selected ? 0 : 1.5,
                padding: main ? "10px 16px" : "7px 12px",
                color: main ? "#fff" : "#1F2423",
                fontSize: main ? 14 : 12.5,
                fontWeight: main ? 700 : 500,
                boxShadow: selected
                  ? "0 0 0 3px rgba(163,38,44,0.18), 0 5px 16px rgba(102,80,60,0.16)"
                  : main
                    ? "0 5px 16px rgba(102,80,60,0.22)"
                    : undefined,
              }}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: statusDot(node) }}
              />
              {node.label}
            </button>
          );
        })}

        {(data.legend?.length ?? 0) > 0 ? (
          <div className="absolute bottom-3.5 left-4 z-[3] flex flex-wrap gap-3 rounded-[9px] bg-[rgba(255,252,248,0.92)] px-3.5 py-2 text-[10.5px] text-[#59625F]">
            {data.legend!.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: l.color }}
                />
                {l.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {active ? (
        <GraphNodeDrawer
          node={active}
          edges={data.edges}
          nodeById={nodeById}
          projectId={projectId}
          onClose={() => setActiveId(null)}
        />
      ) : null}

      <div className="mt-3 grid grid-cols-[180px_minmax(0,1fr)] items-start gap-5 border border-[rgba(213,154,47,0.28)] bg-[rgba(213,154,47,0.07)] px-[18px] py-4">
        <div className="text-[13px] font-semibold text-[#B07d1f]">
          {data.coverageTitle || "资料覆盖"}
        </div>
        <div className="text-[12px] leading-[1.7] text-[#59625F]">
          {data.coverageText ||
            "节点与关系来自项目资料中的主张；连线不代表已独立核验。"}
        </div>
      </div>

      {(data.candidates?.length ?? 0) > 0 ? (
        <ul className="mt-3 space-y-2">
          {data.candidates!.map((c, i) => (
            <li
              key={`${c.text}-${i}`}
              className="rounded-lg border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.7)] px-3.5 py-2.5 text-[12.5px]"
            >
              <span className="font-medium text-[#1F2423]">{c.text}</span>
              {c.src ? (
                <span className="mt-0.5 block text-[11.5px] text-[#59625F]">
                  {c.src}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function parseProjectGraphHtml(
  raw: string | null | undefined,
): ProjectGraphData | null {
  if (!raw?.trim()) return null;
  try {
    const data = JSON.parse(raw) as ProjectGraphData;
    if (!Array.isArray(data.nodes) || data.nodes.length === 0) return null;
    if (!Array.isArray(data.edges)) data.edges = [];
    return data;
  } catch {
    return null;
  }
}
