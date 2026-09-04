import { describe, expect, it } from "vitest";
import {
  ensureSourceRowAnchors,
  ensureTableHeaderNoWrap,
  linkifyCitationMarkers,
  mergeGlossaryAppend,
  mergeSourcesAppend,
  parseChapterGenerateAnswer,
  parseSnapshotAndSourcesAnswer,
  shouldKeepGlossaryTerm,
  extractGlossaryEntriesFromHtml,
  stripEvidenceSourceCellsToLinksOnly,
  extractCiteIdsFromHtml,
  mergeCitedSourcesIntoTable,
  mergeGlossaryFromChapterHtml,
} from "./project-knowledge-citations";

describe("project-knowledge-citations", () => {
  it("linkifyCitationMarkers turns [A-1] into kn-cite anchors", () => {
    const html = linkifyCitationMarkers("<td>项目方整理 [A-1]</td>");
    expect(html).toContain('href="#kn-source-A-1"');
    expect(html).toContain('data-kn-cite="A-1"');
    expect(html).toContain("kn-cite-sup");
    expect(html).toContain(">[A-1]</a>");
  });

  it("linkifyCitationMarkers skips existing <a>", () => {
    const raw =
      '<a class="kn-cite" href="#kn-source-A-1" data-kn-cite="A-1">[A-1]</a>';
    expect(linkifyCitationMarkers(raw)).toBe(raw);
  });

  it("ensureSourceRowAnchors adds tr id", () => {
    const html = ensureSourceRowAnchors(
      "<table><tr><td>A-1</td><td>类型</td></tr></table>",
    );
    expect(html).toContain('id="kn-source-A-1"');
  });

  it("parseSnapshotAndSourcesAnswer splits markers", () => {
    const { snapshotHtml, sourcesHtml } = parseSnapshotAndSourcesAnswer(`
===SNAPSHOT===
<table><tr><td>快照</td></tr></table>
===SOURCES===
<table><tr><td>A-1</td></tr></table>
`);
    expect(snapshotHtml).toContain("快照");
    expect(sourcesHtml).toContain("A-1");
  });

  it("parseChapterGenerateAnswer reads graph segment", () => {
    const p = parseChapterGenerateAnswer(`
===CHAPTER===
<div>概览</div>
===GRAPH===
{"nodes":[{"id":"k0","label":"主体","kind":"主体"}],"edges":[]}
===SOURCES_ADD===
NONE
===GLOSSARY_ADD===
NONE
`);
    expect(p.chapterHtml).toContain("概览");
    expect(p.graphSegment).toContain("k0");
  });

  it("mergeSourcesAppend appends new id and keeps existing", () => {
    const existing = `<table><tbody>
<tr id="kn-source-A-1"><td>A-1</td><td>t</td><td>title</td><td>a</td><td>e</td><td>项目快照</td></tr>
</tbody></table>`;
    const add = `<table><tbody>
<tr><td>A-1</td><td>t</td><td>title</td><td>a</td><td>e</td><td>行业分析</td></tr>
<tr><td>A-2</td><td>公开</td><td>法规</td><td>政府</td><td>摘录</td><td>行业分析</td></tr>
</tbody></table>`;
    const merged = mergeSourcesAppend({
      existingHtml: existing,
      addHtml: add,
      sectionLabel: "行业分析",
    });
    expect(merged).toContain("A-1");
    expect(merged).toContain("A-2");
    expect(merged).toContain("项目快照、行业分析");
    expect(merged.match(/A-1/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it("shouldKeepGlossaryTerm filters common words and analysis-flow jargon", () => {
    expect(shouldKeepGlossaryTerm("投资")).toBe(false);
    expect(shouldKeepGlossaryTerm("市场")).toBe(false);
    expect(shouldKeepGlossaryTerm("Plan")).toBe(false);
    expect(shouldKeepGlossaryTerm("Gate")).toBe(false);
    expect(shouldKeepGlossaryTerm("baseline")).toBe(false);
    expect(shouldKeepGlossaryTerm("Tracker")).toBe(false);
    expect(shouldKeepGlossaryTerm("Untested")).toBe(false);
    expect(shouldKeepGlossaryTerm("Validated")).toBe(false);
    expect(shouldKeepGlossaryTerm("Jessica/Jensen")).toBe(false);
    expect(shouldKeepGlossaryTerm("TAM")).toBe(false);
    expect(shouldKeepGlossaryTerm("GTM")).toBe(false);
    expect(shouldKeepGlossaryTerm("MVP")).toBe(false);
    expect(shouldKeepGlossaryTerm("rPTA")).toBe(true);
    expect(shouldKeepGlossaryTerm("BPC-157")).toBe(true);
    expect(shouldKeepGlossaryTerm("GRS")).toBe(true);
    expect(shouldKeepGlossaryTerm("Addepar")).toBe(true);
    expect(shouldKeepGlossaryTerm("OS")).toBe(true);
    expect(shouldKeepGlossaryTerm("CRM")).toBe(true);
  });

  it("ensureTableHeaderNoWrap adds nowrap", () => {
    const html = ensureTableHeaderNoWrap(
      '<th style="padding:12px 14px">证据/来源</th>',
    );
    expect(html).toContain("white-space:nowrap");
  });

  it("stripEvidenceSourceCellsToLinksOnly keeps only cites", () => {
    const html = stripEvidenceSourceCellsToLinksOnly(`<table>
<thead><tr><th>项目项</th><th>内容</th><th>证据/来源</th></tr></thead>
<tbody>
<tr><td>名称</td><td>xx</td><td>项目方整理 <a class="kn-cite" href="#kn-source-A-1">[A-1]</a></td></tr>
<tr><td>判断</td><td>yy</td><td>综合研判</td></tr>
</tbody></table>`);
    expect(html).toContain('class="kn-cite"');
    expect(html).not.toContain("项目方整理");
    expect(html).toContain("待补");
  });

  it("extractCiteIdsFromHtml reads markers and anchors", () => {
    const html = `<td>[A-1] <a class="kn-cite" href="#kn-source-U-2" data-kn-cite="U-2">[U-2]</a> #source-S-3</td>`;
    expect(extractCiteIdsFromHtml(html)).toEqual(["A-1", "U-2", "S-3"]);
  });

  it("mergeCitedSourcesIntoTable fills empty skeleton from cites and files", () => {
    const merged = mergeCitedSourcesIntoTable({
      existingHtml: `<table><thead><tr><th>ID</th></tr></thead><tbody></tbody></table>`,
      citations: [
        { id: "A-1", usedIn: "项目快照" },
        { id: "A-1", usedIn: "行业分析" },
      ],
      files: [{ id: "A-1", title: "BP.pdf", type: "项目文件" }],
    });
    expect(merged.changed).toBe(true);
    expect(merged.html).toContain("A-1");
    expect(merged.html).toContain("BP.pdf");
    expect(merged.html).toContain("项目快照、行业分析");
  });

  it("mergeCitedSourcesIntoTable fills from package files when chapters have no cites", () => {
    const merged = mergeCitedSourcesIntoTable({
      existingHtml: "",
      citations: [],
      files: [{ id: "A-1", title: "deck.pdf", excerpt: "剧本引擎 BP" }],
    });
    expect(merged.changed).toBe(true);
    expect(merged.html).toContain("deck.pdf");
    expect(merged.html).toContain("剧本引擎 BP");
    expect(merged.html).toContain("资料包");
  });

  it("extractGlossaryEntriesFromHtml picks project terms, not analysis-framework acronyms", () => {
    const html = `<p>托管用 Addepar（家族办公室投资组合与报告系统）。市场规模用 TAM（Total Addressable Market）衡量，可服务市场对应 SAM。</p><p>总市场约 30 亿。下一步做 MVP（Minimum Viable Product）。</p>`;
    const terms = extractGlossaryEntriesFromHtml(html).map((e) => e.term);
    expect(terms).toContain("Addepar");
    expect(terms).not.toContain("TAM");
    expect(terms).not.toContain("SAM");
    expect(terms).not.toContain("MVP");
  });

  it("mergeGlossaryFromChapterHtml appends project terms without dropping existing", () => {
    const existing = `<table><tbody>
<tr><td>GRS</td><td>旧释义</td><td>已有</td></tr>
</tbody></table>`;
    const merged = mergeGlossaryFromChapterHtml({
      existingHtml: existing,
      chapterHtml: `<p>账本对接 Addepar（家族办公室投资组合系统）。</p>`,
      sectionLabel: "功能规划",
    });
    expect(merged).toContain("GRS");
    expect(merged).toContain("Addepar");
    expect(merged).toContain("功能规划");
    expect(merged).not.toContain("MVP");
  });

  it("mergeGlossaryAppend drops analysis-flow rows already in the table", () => {
    const existing = `<table><tbody>
<tr><td>Plan</td><td>内部研究计划</td><td>行动</td></tr>
<tr><td>Gate</td><td>投资闸门</td><td>行动</td></tr>
<tr><td>Jessica/Jensen</td><td>跑一次 Skill 对比文档</td><td>行动</td></tr>
<tr><td>Addepar</td><td>家族办公室投资组合系统</td><td>竞争格局</td></tr>
</tbody></table>`;
    const merged = mergeGlossaryAppend({
      existingHtml: existing,
      addHtml: `<table><tbody>
<tr><td>Untested</td><td>尚未验证的假设</td><td>关键假设</td></tr>
<tr><td>DealCloud</td><td>交易与关系 CRM</td><td>竞争格局</td></tr>
</tbody></table>`,
    });
    expect(merged).not.toContain("Plan");
    expect(merged).not.toContain("Gate");
    expect(merged).not.toContain("Jessica");
    expect(merged).not.toContain("Untested");
    expect(merged).toContain("Addepar");
    expect(merged).toContain("DealCloud");
  });
});
