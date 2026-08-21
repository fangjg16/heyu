/** 项目关系图：LLM 产出 JSON，前端布局渲染 */

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
  type?: string;
  status?: string;
  section?: string;
  evidenceRefs?: string[];
};

export type ProjectGraphData = {
  schemaVersion?: string;
  coverageTitle?: string;
  coverageText?: string;
  filters?: string[];
  legend?: { label: string; color: string }[];
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  candidates?: {
    id?: string;
    text: string;
    src?: string;
    section?: string;
    status?: string;
  }[];
};

const DEFAULT_LEGEND = [
  { label: "主体", color: "#A3262C" },
  { label: "技术/产品", color: "#3F6F63" },
  { label: "资本", color: "#D59A2F" },
  { label: "人物", color: "#2F3D34" },
];

function extractJsonObject(raw: string): unknown | null {
  const t = (raw ?? "").trim();
  if (!t || /^(NONE|无|无新增)\s*$/iu.test(t)) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/iu.exec(t);
  const body = (fence?.[1] ?? t).trim();
  return extractBalancedObject(body, 0);
}

function extractBalancedObject(raw: string, from: number): unknown | null {
  const start = raw.indexOf("{", from);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractGraphObjectLoose(raw: string): unknown | null {
  const text = String(raw ?? "");
  if (!text.trim()) return null;
  const marked =
    /===(?:GRAPH|关系图)===\s*([\s\S]*?)(?====(?:SOURCES_ADD|SOURCES|GLOSSARY_ADD|CHAPTER)===|$)/iu.exec(
      text,
    );
  if (marked?.[1]) {
    const fromMark = extractJsonObject(marked[1]);
    if (fromMark) return fromMark;
  }
  const needle = text.search(/"nodes"\s*:\s*\[/u);
  if (needle >= 0) {
    const start = text.lastIndexOf("{", needle);
    if (start >= 0) {
      const obj = extractBalancedObject(text, start);
      if (obj) return obj;
    }
  }
  return extractJsonObject(text);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function asNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

function canonicalLegendLabel(label: string): string | null {
  const k = label.trim();
  if (!k) return null;
  const hit = DEFAULT_LEGEND.find(
    (c) =>
      c.label === k ||
      (c.label === "主体" && /主体|公司|项目|实体/u.test(k)) ||
      (c.label === "技术/产品" && /技术|产品|平台/u.test(k)) ||
      (c.label === "资本" && /资本|投资|基金|创投|股东/u.test(k)) ||
      (c.label === "人物" && /人物|团队|个人|创始/u.test(k)),
  );
  return hit?.label ?? null;
}

function stabilizeGraphLegend(
  raw: { label: string; color: string }[],
  nodes: ProjectGraphNode[],
): { label: string; color: string }[] {
  const used = new Set(
    nodes
      .map((n) => canonicalLegendLabel(n.kind) || n.kind.trim())
      .filter(Boolean),
  );
  const fromDefault = DEFAULT_LEGEND.filter((d) => used.has(d.label));
  const extras = raw.filter((item) => {
    if (canonicalLegendLabel(item.label)) return false;
    return used.has(item.label);
  });
  const legend = [...fromDefault, ...extras];
  return legend.length ? legend : fromDefault;
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

function coerceNodeKind(
  node: ProjectGraphNode,
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
): string {
  const guessed = guessKindFromLabel(node.label, node.type);
  if (guessed) return guessed;
  if (nodes.length >= 3) {
    const degree = (id: string) =>
      edges.filter((e) => e.from === id || e.to === id).length;
    const mine = degree(node.id);
    if (
      mine >= 2 &&
      nodes.filter((n) => n.id !== node.id).every((n) => degree(n.id) < mine)
    ) {
      return "主体";
    }
  }
  return canonicalLegendLabel(node.kind) || node.kind?.trim() || "主体";
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
    if (a.label && before.includes(a.label) && after.includes(b.label)) {
      return { child: a.id, parent: b.id };
    }
    if (b.label && before.includes(b.label) && after.includes(a.label)) {
      return { child: b.id, parent: a.id };
    }
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
    if (e.type === "hierarchy") {
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

/** 按该图的边排位置：连通块相邻，层次径向。不套固定类型扇区。 */
function layoutProjectGraphNodes(
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
): ProjectGraphNode[] {
  if (nodes.length === 0) return nodes;
  if (nodes.length === 1) return [{ ...nodes[0]!, x: 50, y: 47 }];

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
        const kidAngles = anglesInSlice(
          kids.length,
          mid - span / 2,
          mid + span / 2,
        );
        kids.forEach((kid, j) => {
          placed.set(kid.id, polarPos(40, kidAngles[j]!));
        });
      }
    });
    for (const node of group) {
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

export function normalizeProjectGraphData(
  raw: unknown,
): ProjectGraphData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const rawNodes = Array.isArray(o.nodes) ? o.nodes : [];
  const rawEdges = Array.isArray(o.edges) ? o.edges : [];
  if (rawNodes.length === 0) return null;

  const nodes: ProjectGraphNode[] = rawNodes
    .map((item, i) => {
      if (!item || typeof item !== "object") return null;
      const n = item as Record<string, unknown>;
      const id = asString(n.id) || `n${i + 1}`;
      const label =
        asString(n.label) || asString(n.name) || asString(n.title);
      if (!label) return null;
      return {
        id,
        label,
        kind: asString(n.kind, "主体"),
        type: asString(n.type) || undefined,
        status: asString(n.status) || undefined,
        x: asNum(n.x),
        y: asNum(n.y),
        summary: asString(n.summary) || undefined,
        section: asString(n.section) || undefined,
        evidenceRefs: Array.isArray(n.evidenceRefs)
          ? n.evidenceRefs.map((x) => String(x)).filter(Boolean)
          : undefined,
      } satisfies ProjectGraphNode;
    })
    .filter(Boolean) as ProjectGraphNode[];

  if (nodes.length === 0) return null;
  const idSet = new Set(nodes.map((n) => n.id));

  const edges: ProjectGraphEdge[] = rawEdges
    .map((item, i) => {
      if (!item || typeof item !== "object") return null;
      const e = item as Record<string, unknown>;
      const from = asString(e.from) || asString(e.source);
      const to = asString(e.to) || asString(e.target);
      if (!from || !to || !idSet.has(from) || !idSet.has(to)) return null;
      return {
        id: asString(e.id) || `e${i + 1}`,
        from,
        to,
        label: asString(e.label, "关系"),
        type: asString(e.type) || undefined,
        status: asString(e.status) || undefined,
        section: asString(e.section) || undefined,
        evidenceRefs: Array.isArray(e.evidenceRefs)
          ? e.evidenceRefs.map((x) => String(x)).filter(Boolean)
          : undefined,
      } satisfies ProjectGraphEdge;
    })
    .filter(Boolean) as ProjectGraphEdge[];

  const coercedNodes = nodes.map((n) => ({
    ...n,
    kind: coerceNodeKind(n, nodes, edges),
  }));
  const hub = coercedNodes.find((n) => {
    if (n.type === "project") return true;
    if (coercedNodes.length < 3) return false;
    const degree = (id: string) =>
      edges.filter((e) => e.from === id || e.to === id).length;
    const mine = degree(n.id);
    return (
      mine >= 2 &&
      coercedNodes
        .filter((o) => o.id !== n.id)
        .every((o) => degree(o.id) < mine)
    );
  });
  const typedNodes = coercedNodes.map((n) =>
    hub && n.id === hub.id ? { ...n, type: "project", kind: "主体" } : n,
  );

  const filters = [
    ...new Set(typedNodes.map((n) => n.kind).filter(Boolean)),
  ];

  const parsedLegend = Array.isArray(o.legend)
    ? (o.legend
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const L = item as Record<string, unknown>;
          const label = asString(L.label);
          const color = asString(L.color, "#59625F");
          return label ? { label, color } : null;
        })
        .filter(Boolean) as { label: string; color: string }[])
    : [];
  const legend = stabilizeGraphLegend(parsedLegend, typedNodes);

  const candidates = Array.isArray(o.candidates)
    ? o.candidates
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const c = item as Record<string, unknown>;
          const text = asString(c.text);
          if (!text) return null;
          return {
            id: asString(c.id) || undefined,
            text,
            src: asString(c.src) || undefined,
            section: asString(c.section) || undefined,
            status: asString(c.status) || undefined,
          };
        })
        .filter(Boolean)
    : [];

  return {
    schemaVersion: asString(o.schemaVersion, "1.0") || "1.0",
    coverageTitle: asString(o.coverageTitle) || undefined,
    coverageText: asString(o.coverageText) || undefined,
    filters,
    legend,
    nodes: layoutProjectGraphNodes(typedNodes, edges),
    edges,
    candidates: candidates as ProjectGraphData["candidates"],
  };
}

export function parseProjectGraphFromAnswerSegment(
  segment: string,
): ProjectGraphData | null {
  return normalizeProjectGraphData(extractJsonObject(segment));
}

/** 从整段模型输出里抠关系图：===GRAPH===、代码块、或带 nodes 的 JSON。 */
export function parseProjectGraphFromLlmAnswer(
  answer: string,
  graphSegment?: string,
): ProjectGraphData | null {
  return (
    parseProjectGraphFromAnswerSegment(graphSegment ?? "") ??
    normalizeProjectGraphData(extractGraphObjectLoose(answer))
  );
}

export const PROJECT_GRAPH_JSON_HINT = `输出一个 JSON 对象（可放在 json 代码块内），字段：
{
  "coverageTitle": "短标题",
  "coverageText": "覆盖说明一句",
  "filters": ["按本项目实际类别"],
  "legend": [{"label":"类别名","color":"#3F6F63"}],
  "nodes": [{"id":"k0","label":"…","kind":"本项目里的类别","type":"project","status":"claimed","summary":"…","section":"snapshot","evidenceRefs":["A-1"]}],
  "edges": [{"id":"e1","from":"k0","to":"k1","label":"…","status":"claimed","evidenceRefs":["A-1"]}],
  "candidates": [{"text":"待核验：…","src":"…","section":"questions"}]
}
规则：节点数量按资料来，不要凑数；有项目本体时设一个 type="project" 的中心节点。
node.kind 按这个项目真实出现的实体分类（常见如 主体、技术/产品、资本、人物、客户、供应商，但不要硬套这几类）。
只画资料里站得住的边。两个非中心节点之间若有明确关系（联合创始、产品运行于平台、同轮投资、任职于、上下游），必须画边；没有依据不要编。
层次关系（A 运行于 B、B 是 A 的底层）单独画边，label 写清方向，并设 "type":"hierarchy"、from=下层/平台、to=上层。
不要输出 x/y，也不要按「人物在上 / 资本在右」这类固定版式来想图：每张图的结构不同，位置由系统根据该图的边和层次计算。
禁止输出 SVG/HTML。`;
