import { describe, expect, it } from "vitest";
import {
  extractNamedSubjectsFromText,
  formatNamedSubjectsBlock,
  missingNamedSubjects,
} from "./chapter-named-subjects";

describe("extractNamedSubjectsFromText", () => {
  it("picks 剧云 / Jucloud from a comparison file without hardcoding them", () => {
    const body = [
      "国内对标对象剧云 Jucloud。",
      "剧云提供 AI 剧本分镜。与剧云相比，海外工具更偏英文。",
      "剧云 剧云 剧云 合规与版权是主要差异。",
    ].join("\n");
    const names = extractNamedSubjectsFromText(body, {
      filenameBoost: "剧云 jucloud 对标对比.xlsx",
    });
    expect(names).toContain("剧云");
    expect(names.some((n) => n.toLowerCase() === "jucloud")).toBe(true);
  });
});

describe("missingNamedSubjects", () => {
  it("flags generic overseas comps that omitted the source-named subject", () => {
    const html = "<table><tr><td>GPT / Claude / 豆包</td><td>Sudowrite</td></tr></table>";
    expect(missingNamedSubjects(html, ["剧云", "Jucloud"])).toEqual([
      "剧云",
      "Jucloud",
    ]);
  });

  it("passes when the source-named subject is in the table", () => {
    const html = "<table><tr><td>剧云 Jucloud</td></tr></table>";
    expect(missingNamedSubjects(html, ["剧云", "Jucloud"])).toEqual([]);
  });
});

describe("formatNamedSubjectsBlock", () => {
  it("turns the inventory into a closed checklist", () => {
    const block = formatNamedSubjectsBlock(["剧云", "Jucloud"]);
    expect(block).toContain("必须列入");
    expect(block).toContain("剧云");
    expect(block).toContain("禁止只用通用品类");
  });
});
