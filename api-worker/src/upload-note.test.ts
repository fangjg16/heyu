import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { humanUploadNote } from "./upload-note";

describe("humanUploadNote", () => {
  it("keeps ordinary captions", () => {
    expect(humanUploadNote("审计报告")).toBe("审计报告");
    expect(humanUploadNote("  补充：Q3 口径  ")).toBe("补充：Q3 口径");
  });

  it("treats historical identity keys as empty", () => {
    expect(humanUploadNote("agent_job:abc-123")).toBeNull();
    expect(
      humanUploadNote("startup_interview:round:2:conv-9"),
    ).toBeNull();
    expect(humanUploadNote("seed:startup-heyu-v1")).toBeNull();
    expect(humanUploadNote("seed:startup-heyu-v1:used")).toBeNull();
  });

  it("does not treat similar human text as a key", () => {
    expect(humanUploadNote("agent_job 相关说明")).toBe("agent_job 相关说明");
    expect(humanUploadNote("访谈纪要请对照 startup_interview 目录")).toBe(
      "访谈纪要请对照 startup_interview 目录",
    );
  });

  it("treats blank as empty", () => {
    expect(humanUploadNote(null)).toBeNull();
    expect(humanUploadNote("")).toBeNull();
    expect(humanUploadNote("   ")).toBeNull();
  });
});

describe("persistMarkdownAtPath identity", () => {
  it("no longer looks up or writes internal keys on upload_note", () => {
    const src = readFileSync(
      new URL("./ai-generated-documents.ts", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/WHERE project_id = \? AND upload_note = \?/);
    expect(src).not.toMatch(/agent_job:\$\{/);
    expect(src).not.toMatch(/startup_interview:round/);
  });
});
