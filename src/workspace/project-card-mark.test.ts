import { describe, expect, it } from "vitest";
import { projectCardMark, projectCardMarksFor } from "./project-card-mark";

describe("projectCardMark", () => {
  it("skips Australia and uses Stone Island initials instead of 澳大", () => {
    expect(projectCardMark("澳大利亚 Stone Island 收购开发")).toBe("SI");
  });

  it("skips a lone country name when the title has a more specific token", () => {
    expect(projectCardMark("中国-中亚以货换货贸易")).toBe("中亚");
  });

  it("keeps two-character brands", () => {
    expect(projectCardMark("中澳多肽供应链投资")).toBe("中澳");
    expect(projectCardMark("巨东 AI 业务投资")).toBe("巨东");
    expect(projectCardMark("本初 Narrative Forge AI剧本")).toBe("本初");
    expect(projectCardMark("储能项目 (沃拉&莫若波)")).toBe("储能");
  });

  it("does not emit duplicate characters", () => {
    expect(projectCardMark("人人贷投资项目")).toBe("人贷");
  });

  it("avoids repeating marks across a list", () => {
    const marks = projectCardMarksFor([
      { id: "a", name: "中澳多肽供应链投资" },
      { id: "b", name: "中澳文旅基金" },
    ]);
    expect(marks.get("a")).toBe("中澳");
    expect(marks.get("b")).toBe("文旅");
  });

  it("gives distinct marks for the project library cards", () => {
    const marks = projectCardMarksFor([
      { id: "1", name: "澳大利亚 Stone Island 收购开发" },
      { id: "2", name: "中澳多肽供应链投资" },
      { id: "3", name: "巨东 AI 业务投资" },
      { id: "4", name: "演员 AI 版权经纪投资" },
      { id: "5", name: "本初 Narrative Forge AI剧本" },
      { id: "6", name: "储能项目 (沃拉&莫若波)" },
    ]);
    expect([...marks.values()]).toEqual(["SI", "中澳", "巨东", "演员", "本初", "储能"]);
  });
});
