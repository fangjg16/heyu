import { describe, expect, it } from "vitest";
import {
  filterProjectGraphView,
  graphFilterCategory,
  kindForGraphFilter,
} from "./project-graph-filter";

const bessNodes = [
  {
    id: "wollar",
    label: "沃拉储能项目 (Wollar BESS)",
    kind: "主体",
    type: "project",
    x: 50,
    y: 47,
  },
  {
    id: "moorabool",
    label: "莫若波储能项目 (Moorabool BESS)",
    kind: "项目",
    x: 72,
    y: 22,
  },
  {
    id: "bei",
    label: "北京能源国际 (BEI)",
    kind: "主体",
    x: 22,
    y: 48,
  },
  {
    id: "nsw",
    label: "NSW Planning Portal",
    kind: "主体",
    x: 38,
    y: 18,
  },
  {
    id: "transgrid",
    label: "Transgrid / AEMO",
    kind: "主体",
    x: 78,
    y: 52,
  },
  {
    id: "vic",
    label: "Victorian Planning",
    kind: "主体",
    x: 88,
    y: 28,
  },
  {
    id: "gfm",
    label: "Grid-Forming Inverter",
    kind: "技术",
    x: 62,
    y: 78,
  },
  {
    id: "dc",
    label: "DC-coupled Pilot",
    kind: "技术",
    x: 84,
    y: 72,
  },
];

const bessEdges = [
  { id: "e1", from: "wollar", to: "nsw", label: "DA批准" },
  { id: "e2", from: "wollar", to: "transgrid", label: "GPS审查" },
  { id: "e3", from: "wollar", to: "gfm", label: "采用" },
  { id: "e4", from: "wollar", to: "bei", label: "持有/开发" },
  { id: "e5", from: "moorabool", to: "vic", label: "DA协商" },
  { id: "e6", from: "moorabool", to: "dc", label: "采用" },
  { id: "e7", from: "moorabool", to: "bei", label: "持有/开发" },
];

describe("graphFilterCategory", () => {
  it("does not fold 项目 into 主体", () => {
    expect(graphFilterCategory("项目")).toBe("项目");
    expect(graphFilterCategory("主体")).toBe("主体");
    expect(graphFilterCategory("技术/产品")).toBe("技术");
    expect(graphFilterCategory("技术")).toBe("技术");
  });

  it("keeps 竞品 and 监管 out of 主体", () => {
    expect(graphFilterCategory("竞品/替代")).toBe("竞品");
    expect(graphFilterCategory("监管/政策")).toBe("监管");
  });
});

describe("filterProjectGraphView", () => {
  it("keeps the full graph on 全部", () => {
    const { nodes, edges } = filterProjectGraphView(
      bessNodes,
      bessEdges,
      "全部",
    );
    expect(nodes).toHaveLength(8);
    expect(edges).toHaveLength(7);
  });

  it("keeps 主体 orgs plus the current project and their edges", () => {
    const { nodes, edges } = filterProjectGraphView(
      bessNodes,
      bessEdges,
      "主体",
    );
    expect(nodes.map((n) => n.id).sort()).toEqual(
      ["bei", "nsw", "transgrid", "vic", "wollar"].sort(),
    );
    expect(nodes.find((n) => n.id === "wollar")).toMatchObject({
      x: 50,
      y: 47,
    });
    expect(nodes.find((n) => n.id === "bei")).toMatchObject({ x: 22, y: 48 });
    expect(edges.map((e) => e.id).sort()).toEqual(["e1", "e2", "e4"]);
  });

  it("treats the layout hub as 项目 when a 项目 tab exists", () => {
    const { nodes } = filterProjectGraphView(bessNodes, bessEdges, "项目");
    expect(nodes.map((n) => n.id).sort()).toEqual(["moorabool", "wollar"]);
    expect(nodes.find((n) => n.id === "wollar")).toMatchObject({
      x: 50,
      y: 47,
    });
    expect(nodes.find((n) => n.id === "moorabool")).toMatchObject({
      x: 72,
      y: 22,
    });
  });

  it("keeps the current project when filtering 技术, with connecting edges", () => {
    const { nodes, edges } = filterProjectGraphView(
      bessNodes,
      bessEdges,
      "技术",
    );
    expect(nodes.map((n) => n.id).sort()).toEqual(["dc", "gfm", "wollar"]);
    expect(nodes.find((n) => n.id === "wollar")).toMatchObject({
      x: 50,
      y: 47,
    });
    expect(edges.map((e) => e.id)).toEqual(["e3"]);
  });

  it("does not classify the layout hub as 主体 just because type=project", () => {
    expect(kindForGraphFilter({ kind: "主体", type: "project" }, ["主体"])).toBe(
      "主体",
    );
    expect(
      kindForGraphFilter({ kind: "主体", type: "project" }, ["主体", "项目"]),
    ).toBe("项目");
  });

  it("keeps a 主体-kind hub on 主体 as the current project even if tabs include 项目", () => {
    const nodes = [
      {
        id: "wollar",
        label: "Wollar BESS",
        kind: "主体",
        type: "project" as const,
        x: 50,
        y: 47,
      },
      { id: "bei", label: "BEI", kind: "主体", x: 22, y: 48 },
    ];
    const { nodes: subject } = filterProjectGraphView(
      nodes,
      [{ id: "e1", from: "wollar", to: "bei", label: "持有/开发" }],
      "主体",
      "",
      ["主体", "项目", "技术"],
    );
    expect(subject.map((n) => n.id).sort()).toEqual(["bei", "wollar"]);
    const { nodes: projects } = filterProjectGraphView(
      nodes,
      [],
      "项目",
      "",
      ["主体", "项目", "技术"],
    );
    expect(projects.map((n) => n.id)).toEqual(["wollar"]);
  });

  it("keeps 本初 and competitor edges on 竞品/替代", () => {
    const nodes = [
      {
        id: "benchu",
        label: "本初 NarrativeForge",
        kind: "主体",
        type: "project" as const,
        x: 50,
        y: 47,
      },
      {
        id: "draft",
        label: "Final Draft",
        kind: "竞品/替代",
        x: 20,
        y: 60,
      },
      { id: "plot", label: "PlotLens", kind: "竞品/替代", x: 18, y: 72 },
      { id: "ju", label: "剧云 Jucloud", kind: "竞品/替代", x: 22, y: 82 },
      {
        id: "agent",
        label: "6 Agent 虚拟编剧室",
        kind: "技术/产品",
        x: 68,
        y: 42,
      },
    ];
    const edges = [
      { id: "e1", from: "benchu", to: "draft", label: "格式标准依赖" },
      { id: "e2", from: "benchu", to: "plot", label: "海外产品定义最接近" },
      { id: "e3", from: "benchu", to: "ju", label: "国内直接竞品" },
      { id: "e4", from: "benchu", to: "agent", label: "产品架构层" },
    ];
    const { nodes: shown, edges: shownEdges } = filterProjectGraphView(
      nodes,
      edges,
      "竞品/替代",
    );
    expect(shown.map((n) => n.id).sort()).toEqual(
      ["benchu", "draft", "ju", "plot"].sort(),
    );
    expect(shown.find((n) => n.id === "benchu")).toMatchObject({
      x: 50,
      y: 47,
    });
    expect(shownEdges.map((e) => e.id).sort()).toEqual(["e1", "e2", "e3"]);
  });

  it("keeps 本初 and tech edges on 技术/产品", () => {
    const nodes = [
      {
        id: "benchu",
        label: "本初 NarrativeForge",
        kind: "主体",
        type: "project" as const,
        x: 50,
        y: 47,
      },
      {
        id: "nkg",
        label: "NKG 叙事知识图谱",
        kind: "技术/产品",
        x: 70,
        y: 30,
      },
      {
        id: "agent",
        label: "6 Agent 虚拟编剧室",
        kind: "技术/产品",
        x: 68,
        y: 42,
      },
      {
        id: "llm",
        label: "DeepSeek-V4 API + Qwen3-14B",
        kind: "技术/产品",
        x: 62,
        y: 70,
      },
    ];
    const edges = [
      { id: "e1", from: "benchu", to: "agent", label: "产品架构层" },
      { id: "e2", from: "agent", to: "nkg", label: "Agent 调用 NKG" },
      { id: "e3", from: "benchu", to: "llm", label: "底层模型依赖" },
    ];
    const { nodes: shown, edges: shownEdges } = filterProjectGraphView(
      nodes,
      edges,
      "技术/产品",
    );
    expect(shown.map((n) => n.id).sort()).toEqual(
      ["agent", "benchu", "llm", "nkg"].sort(),
    );
    expect(shownEdges.map((e) => e.id).sort()).toEqual(["e1", "e2", "e3"]);
  });
});
