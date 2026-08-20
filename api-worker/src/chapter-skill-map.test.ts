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

  it("maps business to public-info-search, not returns", () => {
    expect(CHAPTER_SKILL_MAP.business).toEqual(["public-info-search"]);
  });

  it("maps framework to value-creation-plan", () => {
    expect(CHAPTER_SKILL_MAP.framework).toEqual(["value-creation-plan"]);
  });

  it("maps project-overview to intake and node-monitoring", () => {
    expect(CHAPTER_SKILL_MAP["project-overview"]).toEqual([
      "project-intake",
      "node-monitoring",
    ]);
  });

  it("returns no skills for meta pages", () => {
    expect(skillsForChapter("sources")).toEqual([]);
    expect(skillsForChapter("glossary")).toEqual([]);
  });
});

describe("condenseSkillMarkdown", () => {
  it("strips yaml frontmatter and keeps the method body", () => {
    const md = `---
name: dd-checklist
---

# 尽调清单

按优先级列出缺口。

## Workflow

### Step 1

列出缺口。
`;
    const out = condenseSkillMarkdown(md);
    expect(out).not.toContain("name: dd-checklist");
    expect(out).toContain("尽调清单");
    expect(out).toContain("列出缺口");
    expect(out).not.toContain("方法已截断");
  });

  it("drops Handoff blocks and public source catalog tables", () => {
    const md = `# Public Information Search

## Workflow

### Step 2

**Category 1: Regulatory & Approvals**

| Jurisdiction | Sources | Priority Fields |
|-------------|---------|-----------------|
| China | 天眼查, 住建局 | 规划许可 |

### Step 3: Build Comp Table

| Field | Description |
|-------|-------------|
| Transaction name | Project name |

## KB Handoff (legacy — skip)

---KB-HANDOFF---
from-skill: public-info-search
---END-HANDOFF---

## Output Format

- Chat: Markdown
`;
    const out = condenseSkillMarkdown(md);
    expect(out).toContain("Step 3: Build Comp Table");
    expect(out).toContain("Transaction name");
    expect(out).not.toContain("天眼查");
    expect(out).not.toContain("KB-HANDOFF");
    expect(out).not.toContain("Output Format");
    expect(out).not.toContain("from-skill");
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

  it("loads public-info-search for business and value-creation-plan for framework", async () => {
    const business = await buildChapterSkillMethodBlock("business");
    expect(business).toContain("本章 business 对应 skill：public-info-search");
    expect(business).toContain("Define Search Scope");
    expect(business).not.toContain("Council DA tracker");
    expect(business).not.toContain("---KB-HANDOFF---");
    expect(business).not.toContain("边界案例提醒");
    const framework = await buildChapterSkillMethodBlock("framework");
    expect(framework).toContain("本章 framework 对应 skill：value-creation-plan");
  });
});
