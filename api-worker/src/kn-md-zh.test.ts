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
    expect(localizeKnText("Executive summary")).toBe("执行摘要");
    expect(localizeKnText("Key findings")).toBe("要点");
    expect(localizeKnText("Where We Can Win")).toBe("可赢之处");
    expect(
      localizeKnText(
        "Startup Design Phase 0.5–8 completed; Customer Discovery and Brand deferred",
      ),
    ).toBe("创业设计第 0.5–8 阶段已完成；用户访谈、品牌暂缓");
    expect(
      localizeKnText(
        "把握中等 for internal problem and product direction; 把握偏低 for external demand and revenue",
      ),
    ).toBe("内部问题和产品方向把握中等；外部需求和收入把握偏低");
    expect(localizeKnText("User Journey")).toBe("用户旅程");
    expect(localizeKnText("Top three risks and mitigations")).toBe(
      "三大风险与对策",
    );
  });

  it("localizes GPT dash and founder tags", () => {
    expect(tagKindFromLabel("Data — company-reported")).toBe("data");
    expect(localizeTagLabel("Data — company-reported")).toBe("资料 · 厂商自报");
    expect(localizeTagLabel("Data/Opinion")).toBe("资料 · 判断");
    expect(tagKindFromLabel("Founder decision")).toBe("opinion");
    expect(localizeTagLabel("Founder decision")).toBe("团队决定");
    expect(tagKindFromLabel("Unknown")).toBe("gap");
    expect(localizeTagLabel("Estimate, Low confidence")).toBe(
      "估算 · 把握偏低",
    );
  });

  it("does not treat Chinese-body mixed drafts as English-heavy", () => {
    expect(
      isEnglishHeavyMarkdown(`# Competitor landscape

## 1. Competitive Overview

公开产品面已经很挤。Affinity 与 Addepar 覆盖机构报表，协作访谈仍然缺位。
家办投研工作台需要权限、审计和来源引用。
`),
    ).toBe(false);
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
