/** 关系图 tab：在全图上筛选，不把「项目」并进「主体」。 */

export type GraphFilterNode = {
  id: string;
  label: string;
  kind: string;
  type?: string;
  summary?: string;
  x?: number;
  y?: number;
};

export type GraphFilterEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

/** 筛选用类别。项目与主体分开；技术/产品与「技术」视为同一类。 */
export function graphFilterCategory(kind: string): string {
  const k = kind.trim();
  if (!k) return "";
  if (k === "项目" || k === "项目/资产" || /^项目\b/u.test(k)) return "项目";
  if (/技术|产品|平台/u.test(k)) return "技术";
  if (/资本|投资|基金|创投|股东/u.test(k)) return "资本";
  if (/人物|团队|个人|创始/u.test(k)) return "人物";
  if (/主体|公司|实体|机构|监管/u.test(k)) return "主体";
  return k;
}

export function kindsMatchGraphFilter(nodeKind: string, filter: string): boolean {
  const f = filter.trim();
  if (!f || f === "全部") return true;
  const nk = nodeKind.trim();
  if (nk === f) return true;
  const nc = graphFilterCategory(nk);
  const fc = graphFilterCategory(f);
  return Boolean(nc && fc && nc === fc);
}

/**
 * 已有「项目」类节点时，布局中心（type=project）按项目筛，
 * 避免旧数据把中心点强制写成 kind=主体。
 */
export function kindForGraphFilter(
  node: Pick<GraphFilterNode, "kind" | "type">,
  availableKinds: string[],
): string {
  const kind = (node.kind ?? "").trim();
  const hasProjectTab = availableKinds.some(
    (k) => graphFilterCategory(k) === "项目",
  );
  if (node.type === "project" && hasProjectTab) return "项目";
  return kind;
}

export function nodeMatchesGraphFilter(
  node: GraphFilterNode,
  filter: string,
  query: string,
  availableKinds: string[],
): boolean {
  const kind = kindForGraphFilter(node, availableKinds);
  const filterOk =
    filter === "全部" || kindsMatchGraphFilter(kind, filter);
  const q = query.trim().toLowerCase();
  const queryOk =
    !q ||
    [node.label, node.kind, node.summary ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(q);
  return filterOk && queryOk;
}

export function filterProjectGraphView<
  N extends GraphFilterNode,
  E extends GraphFilterEdge,
>(
  nodes: N[],
  edges: E[],
  filter: string,
  query = "",
  availableKinds?: string[],
): { nodes: N[]; edges: E[] } {
  const fromTabs = (availableKinds ?? []).filter((k) => k.trim());
  const kinds =
    fromTabs.length > 0
      ? fromTabs
      : [...new Set(nodes.map((n) => n.kind).filter((k) => k.trim()))];
  const visible = nodes.filter((node) =>
    nodeMatchesGraphFilter(node, filter, query, kinds),
  );
  const ids = new Set(visible.map((n) => n.id));
  return {
    nodes: visible,
    edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  };
}
