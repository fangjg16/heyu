import { describe, expect, it } from "vitest";
import {
  parseAnalysisKind,
  parseAnalysisKindFromModel,
} from "./analysis-kind";
import { filterTemplateByKind } from "./kn-template-kind";
import { CHAPTER_SKILL_MAP, skillsForChapter } from "./chapter-skill-map";
import {
  buildChapterSkillMethodBlock,
  condenseSkillMarkdown,
} from "./chapter-skill-method";

describe("analysis-kind", () => {
  it("parses aliases", () => {
    expect(parseAnalysisKind("early")).toBe("early");
    expect(parseAnalysisKind("idea")).toBe("early");
    expect(parseAnalysisKind("acquire")).toBe("acquire");
    expect(parseAnalysisKind("buy-to-build")).toBe("acquire");
    expect(parseAnalysisKind("mature")).toBe("mature");
    expect(parseAnalysisKind("nope")).toBeNull();
  });

  it("reads the first token from a model answer", () => {
    expect(parseAnalysisKindFromModel("early\n因为还没收入")).toBe("early");
    expect(parseAnalysisKindFromModel("`acquire`")).toBe("acquire");
    expect(parseAnalysisKindFromModel("乱七八糟")).toBe("mature");
  });
});

describe("filterTemplateByKind", () => {
  const md = `keep
<!-- kn:begin early -->
LEAN
<!-- kn:end -->
<!-- kn:begin mature,acquire -->
BMC
<!-- kn:end -->
tail`;

  it("keeps only matching blocks and strips markers", () => {
    expect(filterTemplateByKind(md, "early")).toContain("LEAN");
    expect(filterTemplateByKind(md, "early")).not.toContain("BMC");
    expect(filterTemplateByKind(md, "early")).not.toContain("kn:begin");
    expect(filterTemplateByKind(md, "mature")).toContain("BMC");
    expect(filterTemplateByKind(md, "mature")).not.toContain("LEAN");
    expect(filterTemplateByKind(md, "acquire")).toContain("BMC");
  });
});

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
      expect(skillsForChapter(id, "mature").length).toBeGreaterThan(0);
      expect(skillsForChapter(id, "early").length).toBeGreaterThan(0);
      expect(skillsForChapter(id, "acquire").length).toBeGreaterThan(0);
    }
  });

  it("maps diligence to dd-checklist", () => {
    expect(CHAPTER_SKILL_MAP.diligence).toEqual(["dd-checklist"]);
  });

  it("maps ownership to background-check for mature", () => {
    expect(skillsForChapter("ownership", "mature")).toEqual(["background-check"]);
  });

  it("uses business-due-diligence for mature business, startup-design for early", () => {
    expect(skillsForChapter("business", "mature")).toEqual([
      "business-due-diligence",
    ]);
    expect(skillsForChapter("business", "early")[0]).toBe("startup-design");
  });

  it("puts battle-card skills on early benchmarks only as primary", () => {
    expect(skillsForChapter("benchmarks", "early")[0]).toBe("startup-competitors");
    expect(skillsForChapter("benchmarks", "mature")).not.toContain(
      "startup-positioning",
    );
  });

  it("uses acquisition-gate for acquire framework", () => {
    expect(skillsForChapter("framework", "acquire")[0]).toBe("acquisition-gate");
  });

  it("drops node-monitoring from overview", () => {
    expect(skillsForChapter("project-overview", "mature")).toEqual([
      "project-intake",
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

  it("loads business-due-diligence for mature business", async () => {
    const business = await buildChapterSkillMethodBlock("business", undefined, "mature");
    expect(business).toContain("本章 business 对应 skill：business-due-diligence");
    expect(business).toContain("Business Due Diligence");
    const framework = await buildChapterSkillMethodBlock("framework");
    expect(framework).toContain("value-creation-plan");
  });

  it("injects honesty protocol for early industry via startup-design", async () => {
    const industry = await buildChapterSkillMethodBlock(
      "industry",
      undefined,
      "early",
    );
    expect(industry).toContain("startup-design");
    expect(industry).toContain("startup-competitors");
  });
});
