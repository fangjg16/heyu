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

  it("filters 主体 to org nodes and keeps their original positions", () => {
    const { nodes, edges } = filterProjectGraphView(
      bessNodes,
      bessEdges,
      "主体",
    );
    expect(nodes.map((n) => n.id).sort()).toEqual(
      ["bei", "nsw", "transgrid", "vic"].sort(),
    );
    expect(nodes.find((n) => n.id === "bei")).toMatchObject({ x: 22, y: 48 });
    expect(nodes.find((n) => n.id === "nsw")).toMatchObject({ x: 38, y: 18 });
    expect(edges).toHaveLength(0);
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

  it("filters 技术 without pulling in projects or orgs", () => {
    const { nodes, edges } = filterProjectGraphView(
      bessNodes,
      bessEdges,
      "技术",
    );
    expect(nodes.map((n) => n.id).sort()).toEqual(["dc", "gfm"]);
    expect(edges).toHaveLength(0);
  });

  it("does not inject the project hub into a non-project filter", () => {
    expect(kindForGraphFilter({ kind: "主体", type: "project" }, ["主体"])).toBe(
      "主体",
    );
    expect(
      kindForGraphFilter({ kind: "主体", type: "project" }, ["主体", "项目"]),
    ).toBe("项目");
  });

  it("uses tab list so a 主体-kind hub still leaves the 主体 filter", () => {
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
      [],
      "主体",
      "",
      ["主体", "项目", "技术"],
    );
    expect(subject.map((n) => n.id)).toEqual(["bei"]);
    const { nodes: projects } = filterProjectGraphView(
      nodes,
      [],
      "项目",
      "",
      ["主体", "项目", "技术"],
    );
    expect(projects.map((n) => n.id)).toEqual(["wollar"]);
  });
});
