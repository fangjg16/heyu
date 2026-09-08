import { describe, expect, it } from "vitest";
import { formatProjectKnowledgeState } from "./project-knowledge-state";

describe("formatProjectKnowledgeState", () => {
  it("keeps parsed upload summaries as standing project knowledge", () => {
    const text = formatProjectKnowledgeState(
      [
        {
          documentId: "d1",
          filename: "项目介绍.pdf",
          summary: "南宁生鲜港一期冷库 12 万吨。",
          keyPoints: ["西南农产品流通"],
          scope: "package",
        },
      ],
      "【项目登记信息】\n项目名称：南宁生鲜港\n",
    );
    expect(text).toContain("南宁生鲜港");
    expect(text).toContain("12 万吨");
    expect(text).toContain("项目介绍.pdf");
    expect(text).not.toContain("正在检索");
  });
});
