import { describe, expect, it } from "vitest";
import { CHAPTER_SKILL_MAP, skillsForChapter } from "./chapter-skill-map";
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

  it("maps ownership to background-check", () => {
    expect(CHAPTER_SKILL_MAP.ownership).toEqual(["background-check"]);
  });

  it("returns no skills for meta pages", () => {
    expect(skillsForChapter("sources")).toEqual([]);
    expect(skillsForChapter("glossary")).toEqual([]);
  });
});

describe("condenseSkillMarkdown", () => {
  it("strips yaml frontmatter and keeps the full method body", () => {
    const md = `---
name: dd-checklist
---

# 尽调清单

按优先级列出缺口。

## 长附录

${"x".repeat(4000)}
`;
    const out = condenseSkillMarkdown(md);
    expect(out).not.toContain("name: dd-checklist");
    expect(out).toContain("尽调清单");
    expect(out).toContain("x".repeat(4000));
    expect(out).not.toContain("方法已截断");
  });
});

describe("buildChapterSkillMethodBlock", () => {
  it("reads SKILL.md from the repo and wraps a fill-only lock", async () => {
    const block = await buildChapterSkillMethodBlock("diligence");
    expect(block).toContain("【分析方法 · 只用于填写模板中的「待补」】");
    expect(block).toContain("dd-checklist");
    expect(block).toContain("禁止改表头或替换【章节 Markdown 模板】");
    expect(block).toContain("Due Diligence Checklist");
  });

  it("returns empty when the chapter has no mapped skill", async () => {
    expect(await buildChapterSkillMethodBlock("sources")).toBe("");
  });
});
