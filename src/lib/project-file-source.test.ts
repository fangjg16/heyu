import { describe, expect, it } from "vitest";
import type { ProjectFileRecord } from "./project-api";
import { DIRECTORY_MIME, PROJECT_UPLOAD_FOLDER } from "./project-api";
import {
  buildSourceMaterialsTree,
  PROJECT_SOURCE_PATH,
  stripSourcePrefix,
} from "./project-file-source";

function file(
  partial: Pick<ProjectFileRecord, "id" | "filename"> &
    Partial<ProjectFileRecord>,
): ProjectFileRecord {
  return {
    scope: "package",
    conversationId: null,
    mime: "application/pdf",
    createdAt: "2026-04-01T00:00:00.000Z",
    chunkCount: 0,
    relativePath: "",
    ...partial,
  };
}

function projectFolderNames(files: ProjectFileRecord[]): string[] {
  const tree = buildSourceMaterialsTree(files);
  const bucket = tree.children.find(
    (c) => c.kind === "folder" && c.path === PROJECT_SOURCE_PATH,
  );
  if (!bucket || bucket.kind !== "folder") return [];
  return bucket.children
    .filter((c): c is Extract<typeof c, { kind: "folder" }> => c.kind === "folder")
    .map((c) => c.name);
}

describe("stripSourcePrefix project bucket", () => {
  it("strips 项目上传的 without leaving a 的/ remainder", () => {
    expect(stripSourcePrefix("项目上传的/00_概述", "project")).toBe("00_概述");
    expect(stripSourcePrefix(`${PROJECT_UPLOAD_FOLDER}/03_跨海缆车ATW`, "project")).toBe(
      "03_跨海缆车ATW",
    );
  });

  it("also strips legacy 项目上传 so 00/01/02 sit beside 03", () => {
    expect(stripSourcePrefix("项目上传/00_概述", "project")).toBe("00_概述");
    expect(stripSourcePrefix("项目上传/01_规划", "project")).toBe("01_规划");
    expect(stripSourcePrefix("项目上传/02_财务", "project")).toBe("02_财务");
  });
});

describe("buildSourceMaterialsTree numbered folders", () => {
  it("does not hide 00/01/02 and sorts them before 03", () => {
    const files = [
      file({
        id: "d3",
        filename: "截面.pdf",
        relativePath: "项目上传的/03_跨海缆车ATW",
      }),
      file({
        id: "d0",
        filename: "概述.pdf",
        relativePath: "项目上传/00_概述",
      }),
      file({
        id: "d1",
        filename: "规划.pdf",
        relativePath: "项目上传的/01_规划",
      }),
      file({
        id: "d2",
        filename: ".keep",
        mime: DIRECTORY_MIME,
        relativePath: "项目上传的/02_财务",
      }),
    ];
    const names = projectFolderNames(files);
    expect(names).toEqual(["00_概述", "01_规划", "02_财务", "03_跨海缆车ATW"]);
  });

  it("does not nest legacy 项目上传 under the 项目上传 bucket", () => {
    const files = [
      file({
        id: "d0",
        filename: "概述.pdf",
        relativePath: "项目上传/00_概述",
      }),
      file({
        id: "d3",
        filename: "截面.pdf",
        relativePath: "项目上传的/03_跨海缆车ATW",
      }),
    ];
    const names = projectFolderNames(files);
    expect(names).not.toContain("项目上传");
    expect(names[0]).toBe("00_概述");
  });
});
