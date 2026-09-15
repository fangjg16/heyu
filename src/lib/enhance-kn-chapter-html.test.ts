import { describe, expect, it } from "vitest";
import {
  enhanceKnChapterHtml,
  isKnPendingText,
  isKnSourceNote,
  knReadinessTone,
  knVerdictTone,
  looksLikeStatusValue,
} from "./enhance-kn-chapter-html";

describe("knowledge-network display patterns", () => {
  it("treats source footnotes as notes, not body copy", () => {
    expect(
      isKnSourceNote(
        "本章依据项目资料 project-brief.md、theme-classification.md",
      ),
    ).toBe(true);
    expect(isKnSourceNote("核心产品为多模态诊断系统。")).toBe(false);
  });

  it("treats bare 待补 as a placeholder chip", () => {
    expect(isKnPendingText("待补")).toBe(true);
    expect(isKnPendingText("待补。")).toBe(true);
    expect(isKnPendingText("待补充临床数据后评估")).toBe(false);
  });

  it("grades recommendation and IC readiness by meaning, not by heading", () => {
    expect(knVerdictTone("Defer（暂缓）")).toBe("caution");
    expect(knVerdictTone("Proceed")).toBe("go");
    expect(knVerdictTone("Promising")).toBe("go");
    expect(knVerdictTone("Pass（不投）")).toBe("stop");
    expect(knReadinessTone("Not Ready（未就绪）")).toBe("stop");
    expect(knReadinessTone("Ready")).toBe("go");
    expect(looksLikeStatusValue("Defer（暂缓）")).toBe(true);
    expect(looksLikeStatusValue("理由：")).toBe(false);
    expect(looksLikeStatusValue("注册周期长且不确定性高")).toBe(false);
  });
});

describe("enhanceKnChapterHtml", () => {
  it.skipIf(typeof DOMParser === "undefined")(
    "promotes bare screening-memo blocks into kn components",
    () => {
    const html = enhanceKnChapterHtml(`
      <h3>一句话业务</h3>
      <p>北京精冕科技以多模态诊断系统构建诊疗闭环。</p>
      <p>本章依据项目资料 project-brief.md、theme-classification.md</p>
      <h3>建议</h3>
      <p>Defer（暂缓）</p>
      <p>理由：注册周期长。</p>
      <h3>正方意见</h3>
      <ul><li>患者基数大</li></ul>
      <h3>反方意见</h3>
      <ul><li>待补</li></ul>
      <h3>IC 就绪度</h3>
      <p>Not Ready（未就绪）</p>
    `);
    expect(html).toContain("kn-lede-card");
    expect(html).toContain("kn-source-note");
    expect(html).toContain("kn-verdict--caution");
    expect(html).toContain("注册周期长");
    expect(html).toContain("kn-split__col--go");
    expect(html).toContain("kn-split__col--stop");
    expect(html).toContain("kn-readiness--stop");
    expect(html).toContain("kn-pending");
    expect(html).not.toContain("<h3>建议</h3>");
    },
  );
});
