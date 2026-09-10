import { describe, expect, it } from "vitest";
import {
  parsePipelineStage,
  pipelineHeaderActions,
  pipelineStageLabel,
  pipelineStageOptionsForEdit,
  resolvePipelineForSave,
} from "./pipeline-stage";

describe("parsePipelineStage", () => {
  it("accepts canonical ids", () => {
    expect(parsePipelineStage("inbound")).toBe("inbound");
    expect(parsePipelineStage("deal-screening")).toBe("deal-screening");
    expect(parsePipelineStage("IC")).toBe("ic-review");
  });

  it("rejects junk", () => {
    expect(parsePipelineStage("")).toBeNull();
    expect(parsePipelineStage("active")).toBeNull();
  });
});

describe("resolvePipelineForSave", () => {
  it("clears stage for early", () => {
    expect(
      resolvePipelineForSave({
        analysisKind: "early",
        phase: "进行中",
        current: "inbound",
      }),
    ).toEqual({ phase: "进行中", pipelineStage: null });
  });

  it("creates inbound for new mature", () => {
    expect(
      resolvePipelineForSave({
        analysisKind: "mature",
        phase: "进行中",
        current: null,
      }),
    ).toEqual({ phase: "进行中", pipelineStage: "inbound" });
  });

  it("resumes completed to ic-review", () => {
    expect(
      resolvePipelineForSave({
        analysisKind: "mature",
        phase: "进行中",
        current: "passed",
      }),
    ).toEqual({ phase: "进行中", pipelineStage: "ic-review" });
  });

  it("requires invested or passed when completing without stage", () => {
    expect(() =>
      resolvePipelineForSave({
        analysisKind: "mature",
        phase: "已完成",
        current: null,
      }),
    ).toThrow(/已投或不投/);
  });

  it("rejects invested unless from ic-review without override", () => {
    expect(() =>
      resolvePipelineForSave({
        analysisKind: "mature",
        phase: "进行中",
        current: "deal-screening",
        requested: "invested",
        allowInvestedOverride: false,
      }),
    ).toThrow(/投委/);
  });

  it("allows invested override from edit", () => {
    expect(
      resolvePipelineForSave({
        analysisKind: "mature",
        phase: "进行中",
        current: "inbound",
        requested: "invested",
        allowInvestedOverride: true,
      }),
    ).toEqual({ phase: "已完成", pipelineStage: "invested" });
  });

  it("pass from any in-progress sets completed", () => {
    expect(
      resolvePipelineForSave({
        analysisKind: "mature",
        phase: "进行中",
        current: "inbound",
        requested: "passed",
      }),
    ).toEqual({ phase: "已完成", pipelineStage: "passed" });
  });

  it("freezes stage when paused", () => {
    expect(
      resolvePipelineForSave({
        analysisKind: "mature",
        phase: "已暂停",
        current: "due-diligence",
      }),
    ).toEqual({ phase: "已暂停", pipelineStage: "due-diligence" });
  });
});

describe("pipelineHeaderActions", () => {
  it("has no auto screening button", () => {
    const labels = pipelineHeaderActions("进行中", "inbound").map((a) => a.id);
    expect(labels).toEqual(["pass"]);
  });

  it("offers dd then pass from screening", () => {
    expect(
      pipelineHeaderActions("进行中", "deal-screening").map((a) => a.id),
    ).toEqual(["to-dd", "pass"]);
  });

  it("hides actions when paused", () => {
    expect(pipelineHeaderActions("已暂停", "deal-screening")).toEqual([]);
  });
});

describe("pipelineStageOptionsForEdit", () => {
  it("requires invested or passed when completed", () => {
    expect(pipelineStageOptionsForEdit("已完成").map((o) => o.value)).toEqual([
      "invested",
      "passed",
    ]);
  });

  it("includes override invested while in progress", () => {
    const ids = pipelineStageOptionsForEdit("进行中").map((o) => o.value);
    expect(ids).toContain("inbound");
    expect(ids).toContain("invested");
  });
});

describe("pipelineStageLabel", () => {
  it("uses Chinese", () => {
    expect(pipelineStageLabel("inbound")).toBe("待筛选");
    expect(pipelineStageLabel("passed")).toBe("不投");
  });
});
