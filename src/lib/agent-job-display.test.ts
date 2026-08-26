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
    expect(productizeKnJobSubmitContent("", "project_intake")).toBe(
      "已开始深度分析，完成后将自动更新本对话。",
    );
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
      productizeAssistantBubbleContent("", { pendingJobId: "job-1" }),
    ).toBe("已开始深度分析，完成后将自动更新本对话。");
  });
});
