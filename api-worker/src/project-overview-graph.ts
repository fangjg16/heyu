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

/** 缺坐标时按环状布局补齐（百分位坐标 8–92） */
function layoutProjectGraphNodes(
  nodes: ProjectGraphNode[],
): ProjectGraphNode[] {
  if (nodes.length === 0) return nodes;
  const hasAll = nodes.every(
    (n) =>
      typeof n.x === "number" &&
      typeof n.y === "number" &&
      Number.isFinite(n.x) &&
      Number.isFinite(n.y),
  );
  if (hasAll) {
    return nodes.map((n) => ({
      ...n,
      x: Math.min(92, Math.max(8, n.x!)),
      y: Math.min(92, Math.max(8, n.y!)),
    }));
  }

  const center = nodes.find(
    (n) =>
      n.type === "project" ||
      n.type === "entity" ||
      /主体|项目/u.test(n.kind) ||
      /主体|项目/u.test(n.label),
  );
  const others = nodes.filter((n) => n !== center);
  const out: ProjectGraphNode[] = [];
  if (center) {
    out.push({ ...center, x: 50, y: 48 });
  }
  const n = Math.max(others.length, 1);
  others.forEach((node, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = 34;
    out.push({
      ...node,
      x: Math.round(50 + r * Math.cos(angle)),
      y: Math.round(48 + r * Math.sin(angle) * 0.85),
    });
  });
  return out;
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
    nodes: layoutProjectGraphNodes(typedNodes),
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
  "nodes": [{"id":"k0","label":"…","kind":"主体","type":"project","status":"claimed","x":50,"y":48,"summary":"…","section":"snapshot","evidenceRefs":["A-1"]}],
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
x/y 为 0–100 画布百分比（可省略）；禁止输出 SVG/HTML。`;
