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
): { label: string; color: string }[] {
  const extras = raw.filter((item) => !canonicalLegendLabel(item.label));
  return [...DEFAULT_LEGEND, ...extras];
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

function spreadAngles(count: number, start: number, end: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(start + end) / 2];
  const pad = count === 2 ? 0.16 : 0.07;
  const a0 = start + (end - start) * pad;
  const a1 = end - (end - start) * pad;
  return Array.from(
    { length: count },
    (_, i) => a0 + (i / (count - 1)) * (a1 - a0),
  );
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
  if (
    platA !== platB &&
    /运行|基于|底层|架构|之上|承载/u.test(blob)
  ) {
    return platA
      ? { parent: a.id, child: b.id }
      : { parent: b.id, child: a.id };
  }
  return null;
}

/** 按类型扇区集结；层次关系沿径向内外层排。忽略模型给的 x/y。 */
function layoutProjectGraphNodes(
  nodes: ProjectGraphNode[],
  edges: ProjectGraphEdge[],
): ProjectGraphNode[] {
  if (nodes.length === 0) return nodes;
  const hub =
    nodes.find((n) => n.type === "project") ||
    nodes.find((n) => n.kind === "主体") ||
    nodes[0]!;
  const others = nodes.filter((n) => n.id !== hub.id);
  const groups = new Map<string, ProjectGraphNode[]>();
  for (const node of others) {
    const k = canonicalLegendLabel(node.kind) || node.kind || "主体";
    const list = groups.get(k) ?? [];
    list.push(node);
    groups.set(k, list);
  }

  const arcs: { kind: string; start: number; end: number; radius: number }[] = [
    { kind: "人物", start: (-120 * Math.PI) / 180, end: (-58 * Math.PI) / 180, radius: 29 },
    { kind: "资本", start: (-28 * Math.PI) / 180, end: (102 * Math.PI) / 180, radius: 35 },
    { kind: "技术/产品", start: (128 * Math.PI) / 180, end: (228 * Math.PI) / 180, radius: 27 },
  ];

  const placed = new Map<string, { x: number; y: number }>();
  placed.set(hub.id, { x: 50, y: 47 });

  const placeSpread = (
    list: ProjectGraphNode[],
    start: number,
    end: number,
    radius: number,
  ) => {
    const angles = spreadAngles(list.length, start, end);
    list.forEach((node, i) => {
      placed.set(node.id, polarPos(radius, angles[i]!));
    });
  };

  for (const arc of arcs) {
    const list = groups.get(arc.kind) ?? [];
    if (list.length === 0) continue;
    if (arc.kind !== "技术/产品") {
      placeSpread(list, arc.start, arc.end, arc.radius);
      continue;
    }
    const parentOf = new Map<string, string>();
    const ids = new Set(list.map((p) => p.id));
    const byId = Object.fromEntries(list.map((p) => [p.id, p]));
    for (const e of edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) continue;
      if (e.type === "hierarchy") {
        parentOf.set(e.to, e.from);
        continue;
      }
      const pair = inferHierarchyPair(byId[e.from]!, byId[e.to]!, e.label);
      if (pair) parentOf.set(pair.child, pair.parent);
    }
    const roots = list.filter((n) => !parentOf.has(n.id));
    const trees = (roots.length ? roots : list).map((root) => ({
      root,
      children: list.filter((n) => parentOf.get(n.id) === root.id),
    }));
    const rootAngles = spreadAngles(trees.length, arc.start, arc.end);
    trees.forEach((tree, i) => {
      const mid = rootAngles[i]!;
      const spoke = edges
        .filter(
          (e) =>
            (e.from === tree.root.id && e.to === hub.id) ||
            (e.to === tree.root.id && e.from === hub.id),
        )
        .map((e) => e.label)
        .join(" ");
      const inner =
        looksLikePlatform(tree.root) || tree.children.length > 0
          ? 24
          : /路线图/u.test(spoke)
            ? 36
            : 30;
      placed.set(tree.root.id, polarPos(inner, mid));
      if (tree.children.length === 1) {
        placed.set(tree.children[0]!.id, polarPos(40, mid));
      } else if (tree.children.length > 1) {
        const span = ((arc.end - arc.start) / Math.max(trees.length, 1)) * 0.65;
        const childAngles = spreadAngles(
          tree.children.length,
          mid - span / 2,
          mid + span / 2,
        );
        tree.children.forEach((child, j) => {
          placed.set(child.id, polarPos(40, childAngles[j]!));
        });
      }
    });
  }

  const leftover = others.filter((n) => !placed.has(n.id));
  if (leftover.length) {
    placeSpread(leftover, (70 * Math.PI) / 180, (110 * Math.PI) / 180, 33);
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

  const filters = Array.isArray(o.filters)
    ? o.filters
        .map((x) => canonicalLegendLabel(String(x).trim()) || String(x).trim())
        .filter(Boolean)
    : [...new Set(typedNodes.map((n) => n.kind).filter(Boolean))];

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
  const legend = stabilizeGraphLegend(parsedLegend);

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
    coverageTitle: asString(o.coverageTitle, "来自当前资料") || "来自当前资料",
    coverageText:
      asString(o.coverageText) ||
      "节点与关系来自项目资料中的主张；连线不代表已独立核验。",
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
  "filters": ["主体","技术/产品","资本","人物"],
  "legend": [
    {"label":"主体","color":"#A3262C"},
    {"label":"技术/产品","color":"#3F6F63"},
    {"label":"资本","color":"#D59A2F"},
    {"label":"人物","color":"#2F3D34"}
  ],
  "nodes": [{"id":"k0","label":"…","kind":"主体","type":"project","status":"claimed","summary":"…","section":"snapshot","evidenceRefs":["A-1"]}],
  "edges": [{"id":"e1","from":"k0","to":"k1","label":"…","status":"claimed","evidenceRefs":["A-1"]}],
  "candidates": [{"text":"待核验：…","src":"…","section":"questions"}]
}
规则：5–10 个节点；必须有一个项目/主体中心节点，type 必须是 "project"，kind 必须是 "主体"。
每个 node.kind 必须且只能是 legend 里的某一个 label：主体、技术/产品、资本、人物。
- 公司/项目本体 → 主体
- 产品、平台、技术栈 → 技术/产品
- 投资机构、基金、股东 → 资本
- 创始人、CEO、联创、董事 → 人物
不要把产品和投资机构都标成主体，也不要把人物标成技术/产品。
中心辐射可以有；若资料明确写出两个非中心节点之间的关系（联合创始、产品基于某平台、同轮投资、任职于），必须再画一条边，不要只连中心。没有依据不要编横向关系。
层次关系（产品运行于平台、底层架构支撑某产品）必须单独画边，label 写成「A 运行于 B 之上」这种方向清楚的句子，并设 "type":"hierarchy"、from=平台/底层、to=上层产品。
不要输出 x/y：位置由系统按类型扇区 + 层次径向排列，模型排坐标会被忽略。
禁止输出 SVG/HTML。`;
