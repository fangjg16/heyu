import { describe, expect, it } from "vitest";
import { humanUploadNote } from "./upload-note";

describe("humanUploadNote", () => {
  it("hides historical identity prefixes", () => {
    expect(humanUploadNote("审计报告")).toBe("审计报告");
    expect(humanUploadNote("agent_job:job-1")).toBeNull();
    expect(humanUploadNote("startup_interview:round:1:c1")).toBeNull();
    expect(humanUploadNote("seed:startup-heyu-v1")).toBeNull();
  });
});
