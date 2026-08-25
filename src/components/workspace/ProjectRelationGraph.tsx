import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  dismissIfBackdropClick,
  markBackdropPointerDown,
} from "@/lib/backdrop-dismiss";

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

const KIND_SWATCHES = [
  { label: "主体", re: /主体|公司|项目|实体/, color: "#A3262C" },
  { label: "技术/产品", re: /技术|产品|平台/, color: "#3F6F63" },
  { label: "资本", re: /资本|投资|基金|创投|股东/, color: "#D59A2F" },
  { label: "人物", re: /人物|团队|个人|创始/, color: "#2F3D34" },
] as const;

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

function canonicalKind(kind: string): string | null {
  const k = kind.trim();
  if (!k) return null;
  return KIND_SWATCHES.find((c) => c.label === k || c.re.test(k))?.label ?? null;
}

function guessKindFromLabel(label: string, type?: string): string | null {
  const t = label.trim();
  if (type === "project") return "主体";
  if (
    /[（(](CEO|CFO|CTO|COO|联创|创始人|创始|董事|合伙人)[）)]/iu.test(t) ||
    /(CEO|CFO|CTO|COO|联创|创始人|董事|合伙人)/iu.test(t)
  ) {
    return "人物";
  }
  if (/创投|资本|基金|投资|Venture|Capital|Partners/iu.test(t)) return "资本";
  if (/产品|平台|操作系统|技术栈|Bio-OS|\bOS\b/iu.test(t)) return "技术/产品";
  return null;
}

function isGraphHub(
  node: ProjectGraphNode,
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
): boolean {
  if (nodes.length < 3) return false;
  const degree = (id: string) =>
    edges.filter((e) => e.from === id || e.to === id).length;
  const mine = degree(node.id);
  if (mine < 2) return false;
  return nodes
    .filter((n) => n.id !== node.id)
    .every((n) => degree(n.id) < mine);
}

function resolveNodeKind(
  node: ProjectGraphNode,
  nodes: ProjectGraphNode[] = [],
  edges: ProjectGraphEdge[] = [],
): string {
  const guessed = guessKindFromLabel(node.label, node.type);
  if (guessed) return guessed;
  if (isGraphHub(node, nodes, edges)) return "主体";
  return canonicalKind(node.kind) || node.kind?.trim() || "主体";
}

function legendColorForKind(kind: string): string {
  const cat = canonicalKind(kind);
  const swatch = KIND_SWATCHES.find((c) => c.label === (cat ?? kind.trim()));
  return swatch?.color ?? KIND_SWATCHES[0].color;
}

function displayLegend(
  legend: { label: string; color: string }[] | undefined,
  nodes: ProjectGraphNode[],
): { label: string; color: string }[] {
  const used = new Set<string>();
  for (const n of nodes) {
    const guessed = guessKindFromLabel(n.label, n.type);
    if (guessed) used.add(guessed);
    const cat = canonicalKind(n.kind);
    if (cat) used.add(cat);
    if (n.kind.trim()) used.add(n.kind.trim());
  }
  const items = legend?.length
    ? legend
    : KIND_SWATCHES.map(({ label, color }) => ({ label, color }));
  return items
    .filter((item) => {
      const cat = canonicalKind(item.label);
      return used.has(item.label) || (cat ? used.has(cat) : false);
    })
    .map((item) => {
      const cat = canonicalKind(item.label);
      const swatch = cat
        ? KIND_SWATCHES.find((c) => c.label === cat)
        : undefined;
      return { label: item.label, color: swatch?.color ?? item.color };
    });
}

function nodeKindDot(
  node: ProjectGraphNode,
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
): string {
  if (node.status === "conflict") return "#A06358";
  return legendColorForKind(resolveNodeKind(node, nodes, edges));
}

function clampPct(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function polarPos(r: number, angle: number): { x: number; y: number } {
  return {
    x: Math.round(clampPct(50 + r * Math.cos(angle), 8, 92)),
    y: Math.round(clampPct(47 + r * 0.8 * Math.sin(angle), 11, 87)),
  };
}

function hashAngle(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 360) * (Math.PI / 180);
}

function looksLikePlatform(node: ProjectGraphNode): boolean {
  return /OS|平台|底层|架构|引擎/iu.test(node.label);
}

function inferHierarchyPair(
  a: ProjectGraphNode,
  b: ProjectGraphNode,
  label: string,
): { parent: string; child: string } | null {
  const blob = label || "";
  const platA = looksLikePlatform(a);
  const platB = looksLikePlatform(b);
  const run = /运行于|基于|依赖于|搭建在|建立在/u.exec(blob);
  if (run) {
    const before = blob.slice(0, run.index);
    const after = blob.slice(run.index);
    const aBefore = Boolean(a.label && before.includes(a.label));
    const bBefore = Boolean(b.label && before.includes(b.label));
    const aAfter = Boolean(a.label && after.includes(a.label));
    const bAfter = Boolean(b.label && after.includes(b.label));
    if (aBefore && bAfter) return { child: a.id, parent: b.id };
    if (bBefore && aAfter) return { child: b.id, parent: a.id };
  }
  if (platA !== platB && /运行|基于|底层|架构|之上|承载/u.test(blob)) {
    return platA
      ? { parent: a.id, child: b.id }
      : { parent: b.id, child: a.id };
  }
  return null;
}

function hierarchyMap(
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
): Map<string, string> {
  const parentOf = new Map<string, string>();
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const a = byId[e.from];
    const b = byId[e.to];
    if (!a || !b) continue;
    if ((e as { type?: string }).type === "hierarchy") {
      parentOf.set(e.to, e.from);
      continue;
    }
    const pair = inferHierarchyPair(a, b, e.label);
    if (pair) parentOf.set(pair.child, pair.parent);
  }
  return parentOf;
}

function pickLayoutHub(
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
): ProjectGraphNode | null {
  const typed = nodes.find((n) => n.type === "project");
  if (typed) return typed;
  if (nodes.length < 3) return null;
  const degree = (id: string) =>
    edges.filter((e) => e.from === id || e.to === id).length;
  const ranked = [...nodes].sort((a, b) => degree(b.id) - degree(a.id));
  const top = ranked[0];
  const second = ranked[1];
  if (
    top &&
    second &&
    degree(top.id) >= 2 &&
    degree(top.id) >= degree(second.id) + 2
  ) {
    return top;
  }
  return null;
}

function satelliteComponents(
  satellites: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
  hubId: string | undefined,
): ProjectGraphNode[][] {
  const ids = new Set(satellites.map((s) => s.id));
  const adj = new Map<string, string[]>();
  for (const s of satellites) adj.set(s.id, []);
  for (const e of edges) {
    if (hubId && (e.from === hubId || e.to === hubId)) continue;
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    adj.get(e.from)?.push(e.to);
    adj.get(e.to)?.push(e.from);
  }
  const seen = new Set<string>();
  const byId = Object.fromEntries(satellites.map((s) => [s.id, s]));
  const comps: ProjectGraphNode[][] = [];
  for (const s of satellites) {
    if (seen.has(s.id)) continue;
    const stack = [s.id];
    const group: ProjectGraphNode[] = [];
    seen.add(s.id);
    while (stack.length) {
      const id = stack.pop()!;
      group.push(byId[id]!);
      for (const nb of adj.get(id) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    comps.push(group);
  }
  comps.sort((a, b) => b.length - a.length);
  return comps;
}

function anglesInSlice(count: number, start: number, end: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(start + end) / 2];
  const pad = count === 2 ? 0.18 : 0.1;
  const a0 = start + (end - start) * pad;
  const a1 = end - (end - start) * pad;
  return Array.from(
    { length: count },
    (_, i) => a0 + (i / (count - 1)) * (a1 - a0),
  );
}

/** 按这张图自己的边排：连通块挨在一起，层次沿径向内外。不用固定扇区。 */
function layoutGraphByStructure(
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
): ProjectGraphNode[] {
  if (nodes.length === 0) return nodes;
  if (nodes.length === 1) {
    return [{ ...nodes[0]!, x: 50, y: 47 }];
  }

  const hub = pickLayoutHub(nodes, edges);
  const parentOf = hierarchyMap(nodes, edges);
  const placed = new Map<string, { x: number; y: number }>();
  if (hub) placed.set(hub.id, { x: 50, y: 47 });

  const satellites = hub ? nodes.filter((n) => n.id !== hub.id) : nodes;
  const comps = satelliteComponents(satellites, edges, hub?.id);
  const tau = Math.PI * 2;
  const start = hashAngle(
    (hub?.id ?? nodes.map((n) => n.id).join("|")) || "g",
  );
  const gap = comps.length > 1 ? 0.22 : 0;
  const usable = tau - gap * comps.length;
  const total = Math.max(satellites.length, 1);
  let cursor = start;

  const placeGroup = (
    group: ProjectGraphNode[],
    sliceStart: number,
    sliceEnd: number,
  ) => {
    const children = group.filter((n) => parentOf.has(n.id));
    const roots = group.filter((n) => !parentOf.has(n.id));
    const heads = roots.length ? roots : group;
    const headAngles = anglesInSlice(heads.length, sliceStart, sliceEnd);
    heads.forEach((root, i) => {
      const mid = headAngles[i]!;
      const kids = group.filter((n) => parentOf.get(n.id) === root.id);
      const inner = kids.length > 0 || looksLikePlatform(root) ? 24 : 33;
      placed.set(root.id, polarPos(inner, mid));
      if (kids.length === 1) {
        placed.set(kids[0]!.id, polarPos(40, mid));
      } else if (kids.length > 1) {
        const span = ((sliceEnd - sliceStart) / Math.max(heads.length, 1)) * 0.7;
        const kidAngles = anglesInSlice(kids.length, mid - span / 2, mid + span / 2);
        kids.forEach((kid, j) => {
          placed.set(kid.id, polarPos(40, kidAngles[j]!));
        });
      }
    });
    for (const node of children) {
      if (placed.has(node.id)) continue;
      const parent = parentOf.get(node.id);
      const p = parent ? placed.get(parent) : undefined;
      if (p && hub) {
        const ang = Math.atan2(p.y - 47, p.x - 50);
        placed.set(node.id, polarPos(40, ang));
      } else {
        placed.set(node.id, polarPos(36, (sliceStart + sliceEnd) / 2));
      }
    }
  };

  for (const comp of comps) {
    const slice = usable * (comp.length / total);
    placeGroup(comp, cursor, cursor + slice);
    cursor += slice + gap;
  }

  return nodes.map((n) => {
    const pos = placed.get(n.id);
    return pos ? { ...n, x: pos.x, y: pos.y } : { ...n, x: 50, y: 47 };
  });
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
            ? "#A06358"
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
        onPointerDown={markBackdropPointerDown}
        onClick={(e) => dismissIfBackdropClick(e, onClose)}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="graph-node-drawer-title"
        className="fixed inset-y-0 right-0 z-[161] flex w-[440px] max-w-[92vw] flex-col bg-[#FCFAF6] shadow-[-14px_0_40px_rgba(102,80,60,0.18)] animate-in slide-in-from-right fade-in duration-200"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(78,66,57,0.1)] px-6 py-5">
          <div className="min-w-0">
            <div className="text-[11.5px] font-medium text-[#A06358]">
              项目关系 ·{" "}
              {resolveNodeKind(
                node,
                Object.values(nodeById).filter(Boolean) as ProjectGraphNode[],
                edges,
              )}
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
                  ? "bg-[#EFE7E6] text-[#A06358]"
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
            className="h-[42px] flex-1 rounded-[11px] border-none bg-[#A06358] text-[13px] font-medium text-white"
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
  const legendItems = useMemo(
    () => displayLegend(data.legend, data.nodes),
    [data.legend, data.nodes],
  );

  const { visibleNodes, visibleEdges, nodeById } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = data.nodes.filter((node) => {
      const displayKind = resolveNodeKind(node, data.nodes, data.edges);
      const filterMatch =
        filter === "全部" ||
        node.kind === filter ||
        displayKind === filter ||
        canonicalKind(node.kind) === filter ||
        canonicalKind(displayKind) === filter;
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
    const subset = data.nodes.filter((n) => ids.has(n.id));
    const subsetEdges = data.edges.filter(
      (e) => ids.has(e.from) && ids.has(e.to),
    );
    const visibleNodes = layoutGraphByStructure(subset, subsetEdges);
    const nodeById = Object.fromEntries(visibleNodes.map((n) => [n.id, n]));
    return { visibleNodes, visibleEdges: subsetEdges, nodeById };
  }, [data, filter, query]);

  const coverage = (data.coverageText ?? "").trim();
  const showCoverage =
    Boolean(coverage) &&
    !/连线不代表已独立核验|节点与关系来自项目资料/u.test(coverage);

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
                  ? "border-[rgba(160,99,88,0.3)] bg-[#EFE7E6] text-[#A06358]"
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
            const hierarchy = Boolean(
              from &&
                to &&
                inferHierarchyPair(from, to, e.label),
            );
            return (
              <line
                key={e.id}
                x1={from.x ?? 50}
                y1={from.y ?? 50}
                x2={to.x ?? 50}
                y2={to.y ?? 50}
                stroke={
                  conflict
                    ? "rgba(160,99,88,0.42)"
                    : hierarchy
                      ? "rgba(63,111,99,0.55)"
                      : "rgba(78,66,57,0.27)"
                }
                strokeWidth={conflict ? 0.48 : hierarchy ? 0.55 : 0.32}
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
          const main =
            node.type === "project" ||
            isGraphHub(node, data.nodes, data.edges);
          const selected = activeId === node.id;
          const border =
            node.status === "conflict"
              ? "rgba(160,99,88,0.45)"
              : node.status === "unverified"
                ? "rgba(213,154,47,0.48)"
                : "rgba(63,111,99,0.4)";
          const bg = main
            ? "#A06358"
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
                  ? "rgba(160,99,88,0.65)"
                  : main
                    ? "transparent"
                    : border,
                borderWidth: main && !selected ? 0 : 1.5,
                padding: main ? "10px 16px" : "7px 12px",
                color: main ? "#fff" : "#1F2423",
                fontSize: main ? 14 : 12.5,
                fontWeight: main ? 700 : 500,
                boxShadow: selected
                  ? "0 0 0 3px rgba(160,99,88,0.18), 0 5px 16px rgba(102,80,60,0.16)"
                  : main
                    ? "0 5px 16px rgba(102,80,60,0.22)"
                    : undefined,
              }}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: nodeKindDot(node, data.nodes, data.edges),
                }}
              />
              {node.label}
            </button>
          );
        })}

        {legendItems.length > 0 ? (
          <div className="absolute bottom-3.5 left-4 z-[3] flex flex-wrap gap-3 rounded-[9px] bg-[rgba(255,252,248,0.92)] px-3.5 py-2 text-[10.5px] text-[#59625F]">
            {legendItems.map((l) => (
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

      {showCoverage ? (
        <div className="mt-3 grid grid-cols-[180px_minmax(0,1fr)] items-start gap-5 border border-[rgba(213,154,47,0.28)] bg-[rgba(213,154,47,0.07)] px-[18px] py-4">
          <div className="text-[13px] font-semibold text-[#B07d1f]">
            {data.coverageTitle || "资料覆盖"}
          </div>
          <div className="text-[12px] leading-[1.7] text-[#59625F]">
            {coverage}
          </div>
        </div>
      ) : null}

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
