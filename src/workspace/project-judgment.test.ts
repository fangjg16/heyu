import { describe, expect, it } from "vitest";
import { judgmentFromPipeline } from "./project-judgment";

describe("judgmentFromPipeline", () => {
  it("shows screening for mature in progress", () => {
    const j = judgmentFromPipeline("进行中", "mature", "deal-screening");
    expect(j.label).toBe("筛选");
  });

  it("keeps paused label and notes frozen stage", () => {
    const j = judgmentFromPipeline("已暂停", "mature", "due-diligence");
    expect(j.label).toBe("已暂停");
    expect(j.frozenNote).toBe("尽调");
  });

  it("shows 不投 when completed and passed", () => {
    expect(judgmentFromPipeline("已完成", "mature", "passed").label).toBe("不投");
  });

  it("ignores pipeline for early", () => {
    expect(judgmentFromPipeline("进行中", "early", "inbound").label).toBe(
      "进行中",
    );
  });
});
