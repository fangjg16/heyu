import { describe, expect, it } from "vitest";
import {
  parseReviseChapterAnswer,
  repairStoredChapterHtml,
} from "./chapter-revise-parse";

describe("parseReviseChapterAnswer", () => {
  it("prefers ===NOTE=== / ===CHAPTER=== markers", () => {
    const parsed = parseReviseChapterAnswer(
      `===NOTE===\n已补上剧云。\n===CHAPTER===\n<table><tr><td>剧云</td></tr></table>`,
    );
    expect(parsed.note).toContain("剧云");
    expect(parsed.html).toContain("<table>");
    expect(parsed.html).not.toContain("===CHAPTER===");
  });

  it("parses well-formed JSON", () => {
    const parsed = parseReviseChapterAnswer(
      JSON.stringify({
        note: "已加入剧云",
        html: "<p>剧云 Jucloud</p>",
      }),
    );
    expect(parsed.note).toBe("已加入剧云");
    expect(parsed.html).toBe("<p>剧云 Jucloud</p>");
  });

  it("recovers when HTML attributes break JSON.parse", () => {
    const raw = `{"note":"已按指令补入剧云","html":"<div class="card">剧云</div>\\n\\n\\n<table><tr><td>Jucloud</td></tr></table>"}`;
    const parsed = parseReviseChapterAnswer(raw);
    expect(parsed.html).toContain("剧云");
    expect(parsed.html).toContain("<table>");
    expect(parsed.html).not.toMatch(/^\{"note"/);
    expect(parsed.html).not.toContain("\\n\\n");
    expect(parsed.note).toContain("剧云");
  });
});

describe("repairStoredChapterHtml", () => {
  it("unwraps a stored JSON blob for the draft pane", () => {
    const stored = `{"note":"改写说明","html":"<h2>对标</h2>\\n\\n\\n<table><tr><td>剧云</td></tr></table>"}`;
    const html = repairStoredChapterHtml(stored);
    expect(html.startsWith("<h2>")).toBe(true);
    expect(html).toContain("剧云");
    expect(html).not.toContain("\\n");
    expect(html).not.toContain('"note"');
  });

  it("leaves normal HTML alone", () => {
    const html = "<table><tr><td>GPT</td></tr></table>";
    expect(repairStoredChapterHtml(html)).toBe(html);
  });

  it("unwraps broken JSON that mixed real tags with literal \\\\n", () => {
    const stored =
      '{"note":"已按指令补入剧云","html":"<div class="card">剧云 Jucloud</div>\\n\\n\\n\\n\\n\\n<table><tr><td>剧云</td></tr></table>"}';
    const html = repairStoredChapterHtml(stored);
    expect(html).toContain("剧云");
    expect(html).toContain("<table");
    expect(html).not.toMatch(/^\{"note"/);
    expect(html.includes("\\n")).toBe(false);
  });
});
