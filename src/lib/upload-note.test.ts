import { describe, expect, it } from "vitest";
import { documentNameBlob, humanUploadNote } from "./upload-note";

describe("humanUploadNote", () => {
  it("hides historical identity prefixes", () => {
    expect(humanUploadNote("审计报告")).toBe("审计报告");
    expect(humanUploadNote("agent_job:job-1")).toBeNull();
    expect(humanUploadNote("startup_interview:round:1:c1")).toBeNull();
    expect(humanUploadNote("seed:startup-heyu-v1")).toBeNull();
  });

  it("joins captions onto filenames for search", () => {
    expect(documentNameBlob("附件3.pdf", "2024 审计，用来对收入")).toBe(
      "附件3.pdf 2024 审计，用来对收入",
    );
  });
});
