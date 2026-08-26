import { describe, expect, it } from "vitest";
import { normalizeProjectGraphData } from "./project-overview-graph";

describe("normalizeProjectGraphData kinds", () => {
  it("keeps 项目 kind on the layout hub instead of rewriting it to 主体", () => {
    const data = normalizeProjectGraphData({
      nodes: [
        {
          id: "wollar",
          label: "沃拉储能项目 (Wollar BESS)",
          kind: "项目",
          type: "project",
        },
        { id: "bei", label: "北京能源国际 (BEI)", kind: "主体" },
        { id: "gfm", label: "Grid-Forming Inverter", kind: "技术" },
      ],
      edges: [
        { id: "e1", from: "wollar", to: "bei", label: "持有/开发" },
        { id: "e2", from: "wollar", to: "gfm", label: "采用" },
      ],
    });
    expect(data).toBeTruthy();
    const wollar = data!.nodes.find((n) => n.id === "wollar");
    expect(wollar?.type).toBe("project");
    expect(wollar?.kind).toBe("项目");
    expect(data!.filters).toEqual(
      expect.arrayContaining(["项目", "主体", "技术/产品"]),
    );
    expect(data!.filters).not.toContain("全部");
  });

  it("does not fold kind=项目 into 主体", () => {
    const data = normalizeProjectGraphData({
      nodes: [
        { id: "p", label: "莫若波储能项目", kind: "项目" },
        { id: "o", label: "北京能源国际", kind: "主体" },
      ],
      edges: [{ id: "e1", from: "o", to: "p", label: "持有/开发" }],
    });
    expect(data!.nodes.find((n) => n.id === "p")?.kind).toBe("项目");
    expect(data!.nodes.find((n) => n.id === "o")?.kind).toBe("主体");
  });
});
