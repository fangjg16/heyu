import { describe, expect, it } from "vitest";
import { skillFilePathsToTree } from "./skill-file-tree";

describe("skillFilePathsToTree", () => {
  it("nests references and keeps SKILL.md first", () => {
    const tree = skillFilePathsToTree([
      "references/deep/risk-matrix.md",
      "SKILL.md",
      "references/gotchas.md",
      "knowledge/README.md",
    ]);
    expect(tree.map((n) => n.name)).toEqual([
      "SKILL.md",
      "knowledge",
      "references",
    ]);
    const refs = tree.find((n) => n.kind === "dir" && n.name === "references");
    expect(refs?.kind).toBe("dir");
    if (refs?.kind !== "dir") return;
    expect(refs.children.map((n) => n.name)).toEqual(["gotchas.md", "deep"]);
  });

  it("ignores empty and parent-dir paths", () => {
    expect(skillFilePathsToTree(["", "../x", "SKILL.md"])).toEqual([
      { kind: "file", name: "SKILL.md", path: "SKILL.md" },
    ]);
  });
});
