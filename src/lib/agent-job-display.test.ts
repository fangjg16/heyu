import { describe, expect, it } from "vitest";
import {
  productizeAssistantBubbleContent,
  productizeKnJobSubmitContent,
} from "./agent-job-display";

describe("productizeKnJobSubmitContent", () => {
  it("does not label non-KN jobs as 13-section knowledge network", () => {
    expect(
      productizeKnJobSubmitContent(
        "已提交 slot-batched v1（4 批次串行 / 13 slot）。全部 hard gate 通过后一次性入库。",
        "project_intake",
      ),
    ).toBe("已开始深度分析，完成后将自动更新本对话。");
    expect(productizeKnJobSubmitContent("", "standard")).toBe("正在生成，请稍候…");
    expect(
      productizeKnJobSubmitContent("已提交深度分析任务，正在由后台引擎处理", "standard"),
    ).toBe("正在生成，请稍候…");
  });

  it("keeps KN copy only for knowledge_network jobs", () => {
    expect(
      productizeKnJobSubmitContent(
        "已提交 slot-batched v1（4 批次串行 / 13 slot）。全部 hard gate 通过后一次性入库。",
        "knowledge_network",
      ),
    ).toContain("13 个板块");
  });

  it("defaults empty pending jobs to deep analysis, not KN", () => {
    expect(productizeKnJobSubmitContent("")).toBe(
      "已开始深度分析，完成后将自动更新本对话。",
    );
    expect(
      productizeAssistantBubbleContent("正在生成，请稍候…", {
        pendingJobId: "job-1",
        skillIntent: "standard",
      }),
    ).toBe("");
    expect(
      productizeAssistantBubbleContent("", { pendingJobId: "job-1" }),
    ).toBe("");
    expect(
      productizeAssistantBubbleContent(
        "项目资料 API 暂时不可用。根据项目名称，这是澳洲储能。",
      ),
    ).toBe("根据项目名称，这是澳洲储能。");
  });
});
