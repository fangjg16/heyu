import { describe, expect, it } from "vitest";
import { CHAPTER_SKILL_MAP, attachChapterSkills, skillsForChapter } from "./chapter-skill-map";
import {
  buildChapterSkillMethodBlock,
  condenseSkillMarkdown,
} from "./chapter-skill-method";

describe("chapter-skill-map", () => {
  it("covers every knowledge-network chapter id", () => {
    const ids = [
      "project-overview",
      "snapshot",
      "objectives",
      "industry",
      "capabilities",
      "legal",
      "benchmarks",
      "business",
      "returns",
      "ownership",
      "diligence",
      "risks",
      "questions",
      "framework",
    ];
    for (const id of ids) {
      expect(skillsForChapter(id).length).toBeGreaterThan(0);
    }
  });

  it("maps diligence to dd-checklist", () => {
    expect(CHAPTER_SKILL_MAP.diligence).toEqual(["dd-checklist"]);
  });

  it("attaches mapped skills onto a template row", () => {
    expect(attachChapterSkills({ id: "diligence", title: "尽职调查" })).toEqual({
      id: "diligence",
      title: "尽职调查",
      skills: ["dd-checklist"],
    });
  });

  it("maps ownership to background-check", () => {
    expect(CHAPTER_SKILL_MAP.ownership).toEqual(["background-check"]);
  });

  it("returns no skills for meta pages", () => {
    expect(skillsForChapter("sources")).toEqual([]);
    expect(skillsForChapter("glossary")).toEqual([]);
  });
});

describe("condenseSkillMarkdown", () => {
  it("strips yaml frontmatter and keeps a short excerpt", () => {
    const md = `---
name: dd-checklist
---

# 尽调清单

按优先级列出缺口。

## 长附录

${"x".repeat(4000)}
`;
    const out = condenseSkillMarkdown(md, 200);
    expect(out).not.toContain("name: dd-checklist");
    expect(out).toContain("尽调清单");
    expect(out).toContain("方法已截断");
    expect(out.length).toBeLessThan(280);
  });
});

describe("buildChapterSkillMethodBlock", () => {
  it("reads condensed SKILL.md from the repo and wraps a fill-only lock", async () => {
    const block = await buildChapterSkillMethodBlock("diligence");
    expect(block).toContain("【分析方法 · 只用于填写模板中的「待补」】");
    expect(block).toContain("dd-checklist");
    expect(block).toContain("禁止增加模板外的章节或表格列");
    expect(block.length).toBeLessThanOrEqual(3_600 + 400);
  });

  it("returns empty when the chapter has no mapped skill", async () => {
    expect(await buildChapterSkillMethodBlock("sources")).toBe("");
  });
});
