import { describe, expect, it } from "vitest";
import {
  isEnglishHeavyMarkdown,
  localizeKnText,
  localizeTagLabel,
  tagKindFromLabel,
} from "./kn-md-zh";

describe("kn-md-zh", () => {
  it("splits Chinese-comma evidence tags", () => {
    expect(tagKindFromLabel("Data，访谈")).toBe("data");
    expect(localizeTagLabel("Data，团队叙事")).toBe("资料 · 团队叙事");
    expect(localizeTagLabel("Opinion")).toBe("判断");
  });

  it("translates mixed English labels", () => {
    expect(localizeKnText("Significant concerns")).toBe("重大疑虑");
    expect(localizeKnText("## 七、Flags")).toBe("## 七、风险标记");
    expect(localizeKnText("Red Flags")).toBe("红旗");
  });

  it("detects English-heavy GPT drafts vs Chinese Qwen drafts", () => {
    expect(
      isEnglishHeavyMarkdown(`# Competitor landscape

## 1. Executive View

**Phase:** 3 — Market Research Synthesis
**Section confidence:** Medium for public product facts.

The market is crowded with Affinity and Addepar.
`),
    ).toBe(true);
    expect(
      isEnglishHeavyMarkdown(`# 目标客户分析

### 一、核心痛点人群

高压脑力上班族加班导致入睡难。
`),
    ).toBe(false);
  });
});
