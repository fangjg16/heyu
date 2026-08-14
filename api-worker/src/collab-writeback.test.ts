import { describe, expect, it } from "vitest";
import { appendConfirmedAnswerToQuestionsHtml } from "./collab-writeback";

describe("collab-writeback", () => {
  it("inserts after matching paragraph", () => {
    const html = `<p>GPS 第二轮审查结果的具体技术反馈</p><p>其它</p>`;
    const next = appendConfirmedAnswerToQuestionsHtml(
      html,
      "GPS 第二轮审查结果的具体技术反馈",
      `<div class="kn-collab-confirmed">ok</div>`,
    );
    expect(next).toContain("</p>\n<div class=\"kn-collab-confirmed\">ok</div><p>其它</p>");
  });

  it("appends section when question not found", () => {
    const next = appendConfirmedAnswerToQuestionsHtml(
      "<p>无关</p>",
      "不存在的问题",
      `<div class="kn-collab-confirmed">ok</div>`,
    );
    expect(next).toContain("kn-collab-writeback");
    expect(next).toContain("kn-collab-confirmed");
  });
});
