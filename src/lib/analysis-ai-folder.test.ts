import { describe, expect, it } from "vitest";
import type { ProjectFileRecord } from "./project-api";
import { DIRECTORY_MIME } from "./project-api";
import {
  analysisAiFolderPhysical,
  hasAnalysisDeliverableFiles,
  showAllChaptersRerenderAction,
} from "./analysis-ai-folder";

function file(
  partial: Pick<ProjectFileRecord, "id" | "filename"> &
    Partial<ProjectFileRecord>,
): ProjectFileRecord {
  return {
    scope: "package",
    conversationId: null,
    mime: "text/markdown",
    createdAt: "2026-04-01T00:00:00.000Z",
    chunkCount: 0,
    relativePath: "",
    ...partial,
  };
}

describe("hasAnalysisDeliverableFiles", () => {
  it("ignores .keep and tiny stubs in the analysis folder", () => {
    const folder = analysisAiFolderPhysical("early");
    const files = [
      file({
        id: "keep",
        filename: ".keep",
        mime: DIRECTORY_MIME,
        relativePath: folder,
        sizeBytes: 0,
      }),
      file({
        id: "stub",
        filename: "目标客户.md",
        relativePath: folder,
        sizeBytes: 40,
      }),
    ];
    expect(hasAnalysisDeliverableFiles(files, "early")).toBe(false);
  });

  it("counts a real markdown deliverable under the kind folder", () => {
    const folder = analysisAiFolderPhysical("mature");
    const files = [
      file({
        id: "md",
        filename: "行业与市场.md",
        relativePath: folder,
        sizeBytes: 2400,
      }),
    ];
    expect(hasAnalysisDeliverableFiles(files, "mature")).toBe(true);
    expect(hasAnalysisDeliverableFiles(files, "early")).toBe(false);
  });

  it("treats unknown size as present if the file is not a folder marker", () => {
    const folder = analysisAiFolderPhysical("acquire");
    const files = [
      file({
        id: "legacy",
        filename: "交易结构.md",
        relativePath: folder,
      }),
    ];
    expect(hasAnalysisDeliverableFiles(files, "acquire")).toBe(true);
  });
});

describe("showAllChaptersRerenderAction", () => {
  it("shows 仅重新排版 when a draft exists even without analysis files", () => {
    expect(
      showAllChaptersRerenderAction({ hasDraft: true, hasAnalysis: false }),
    ).toBe(true);
  });

  it("shows 仅重新排版 when analysis files exist without a draft", () => {
    expect(
      showAllChaptersRerenderAction({ hasDraft: false, hasAnalysis: true }),
    ).toBe(true);
  });

  it("hides 仅重新排版 when there is neither draft nor analysis", () => {
    expect(
      showAllChaptersRerenderAction({ hasDraft: false, hasAnalysis: false }),
    ).toBe(false);
  });
});
