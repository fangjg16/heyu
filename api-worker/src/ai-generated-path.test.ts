import { describe, expect, it } from "vitest";
import { aiGeneratedPathForIntent, interviewNotesPath } from "./ai-generated-path";
import { pickCurrentDocuments } from "./document-versions";

describe("ai-generated-path", () => {
  it("puts IC memo on the capitallens decision path", () => {
    expect(aiGeneratedPathForIntent("ic_memo")).toEqual({
      pack: "capitallens",
      folder: "05-decision",
      filename: "investment-analysis-report.md",
      relativePath: "AI生成/capitallens/05-decision",
    });
  });

  it("puts acquisition gate on buy-to-build decision path", () => {
    expect(aiGeneratedPathForIntent("acquisition_gate")?.filename).toBe(
      "acquisition-decision.md",
    );
  });

  it("skips knowledge_network", () => {
    expect(aiGeneratedPathForIntent("knowledge_network")).toBeNull();
  });

  it("puts interview notes under startup intake", () => {
    expect(interviewNotesPath().relativePath).toBe("AI生成/startup/00-intake");
  });
});

describe("document versions", () => {
  it("keeps only the current file at the same path", () => {
    const docs = [
      {
        id: "old",
        filename: "brief.md",
        relativePath: "AI生成/startup/00-intake",
        createdAt: "2026-01-01",
      },
      {
        id: "new",
        filename: "brief.md",
        relativePath: "AI生成/startup/00-intake",
        replacesDocumentId: "old",
        versionGroup: "old",
        createdAt: "2026-02-01",
      },
    ];
    const current = pickCurrentDocuments(docs);
    expect(current.map((d) => d.id)).toEqual(["new"]);
  });
});
