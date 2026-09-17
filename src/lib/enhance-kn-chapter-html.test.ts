import { describe, expect, it } from "vitest";
import {
  enhanceKnChapterHtml,
  isKnPendingText,
  isKnSourceNote,
  knDisplayHeadingTitle,
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

  it("strips outline numbers from visible titles", () => {
    expect(knDisplayHeadingTitle("11. 一句话业务")).toBe("一句话业务");
    expect(knDisplayHeadingTitle("9.3 反方意见")).toBe("反方意见");
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

  it.skipIf(typeof DOMParser === "undefined")(
    "turns screening and diligence conclusions into decision cards",
    () => {
      const html = enhanceKnChapterHtml(`
        <h4>初筛结论</h4>
        <p>核心判断：值得保留联系。</p>
        <ul>
          <li>总体评级：Watch（观察）。</li>
          <li>下一步建议：request_information（先补关键事实）。</li>
          <li>支持理由：已有付费窗口。</li>
        </ul>
        <h4>投资结论</h4>
        <p>投资建议：Defer（暂缓投资，继续定向验证）。</p>
        <p>核心判断：证据不足。</p>
        <p>值得继续看的原因有三点。</p>
      `);
      expect(html).toContain("kn-decision--caution");
      expect(html).toContain("观察");
      expect(html).toContain("先补关键事实");
      expect(html).toContain("暂缓投资");
      expect(html).not.toContain("request_information");
      expect(html).toContain("值得继续看的原因有三点");
    },
  );

  it.skipIf(typeof DOMParser === "undefined")(
    "turns an equity paragraph into a cap tree",
    () => {
      const html = enhanceKnChapterHtml(`
        <p>传媒：巨东文化55%，本分本心45%。文化：李元74.2298%、巨东合力9.31%、深圳汇文4.9%。本分本心：吴钢100%。</p>
      `);
      expect(html).toContain("kn-cap");
      expect(html).toContain("传媒");
      expect(html).toContain("55%");
      expect(html).toContain("kn-cap__wires");
    },
  );

  it.skipIf(typeof DOMParser === "undefined")(
    "turns mermaid flowchart code into a cap figure",
    () => {
      const html = enhanceKnChapterHtml(`
        <pre class="kn-pre"><code>flowchart TD
    LY[李元] -->|74%| WH[巨东文化]
    WH -->|55%| CM[巨东传媒]
    BF[本分本心] -->|45%| CM
</code></pre>
      `);
      expect(html).toContain("kn-cap");
      expect(html).toContain("巨东传媒");
      expect(html).not.toContain("kn-pre");
      expect(html).toContain("kn-cap__hold");
    },
  );

  it.skipIf(typeof DOMParser === "undefined")(
    "moves in-node equity percents onto 持有 labels",
    () => {
      const html = enhanceKnChapterHtml(`
        <figure class="kn-cap">
          <div class="kn-cap__levels">
            <div class="kn-cap__level"><div class="kn-cap__cell"><div class="kn-cap__node kn-cap__node--root"><span class="kn-cap__name">巨东传媒</span></div></div></div>
            <div class="kn-cap__level"><div class="kn-cap__cell"><div class="kn-cap__node"><span class="kn-cap__name">巨东文化</span><span class="kn-cap__pct">55%</span></div></div></div>
          </div>
        </figure>
      `);
      expect(html).toContain("持有 55%");
      expect(html).toContain("kn-cap__hold");
      expect(html).not.toContain("kn-cap__pct");
    },
  );

  it.skipIf(typeof DOMParser === "undefined")(
    "turns 本章结论 and 判断 into distinct blocks",
    () => {
      const html = enhanceKnChapterHtml(`
        <p>文稿状态：工作稿；证据核验状态：部分完成。</p>
        <p>本章结论：尚不能确认实际控制。当前最需优先解决的是：欠税线索。</p>
        <p>判断：减资本身可以是正常重组。</p>
      `);
      expect(html).toContain("kn-statusrow");
      expect(html).toContain("kn-takeaway");
      expect(html).toContain("当前最需优先解决");
      expect(html).toContain("kn-judgment");
      expect(html).toContain("kn-next");
    },
  );
});
