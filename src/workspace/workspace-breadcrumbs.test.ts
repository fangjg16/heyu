import { describe, expect, it } from "vitest";
import {
  projectCrumbLabel,
  workspaceBreadcrumbs,
} from "./workspace-breadcrumbs";

describe("workspaceBreadcrumbs", () => {
  it("keeps the project name as the current crumb on the project workspace", () => {
    expect(
      workspaceBreadcrumbs({
        pathname: "/app/projects/p1/knowledge",
        projectId: "p1",
        projectName: "睡眠空间AI",
      }),
    ).toEqual([
      { label: "项目库", to: "/app/projects" },
      { label: "睡眠空间AI", current: true },
    ]);
  });

  it("adds a review crumb and makes the project name a link back to knowledge", () => {
    expect(
      workspaceBreadcrumbs({
        pathname: "/app/projects/p1/knowledge/review/run-1",
        projectId: "p1",
        projectName: "睡眠空间AI",
      }),
    ).toEqual([
      { label: "项目库", to: "/app/projects" },
      { label: "睡眠空间AI", to: "/app/projects/p1/knowledge" },
      { label: "审核草案", current: true },
    ]);
  });

  it("does not fall back to the raw project id before the name loads", () => {
    expect(
      workspaceBreadcrumbs({
        pathname: "/app/projects/proj-19c7527bcdff/knowledge/review/run-1",
        projectId: "proj-19c7527bcdff",
      }),
    ).toEqual([
      { label: "项目库", to: "/app/projects" },
      {
        label: "项目",
        to: "/app/projects/proj-19c7527bcdff/knowledge",
      },
      { label: "审核草案", current: true },
    ]);
  });

  it("treats blank names as still loading", () => {
    expect(projectCrumbLabel("")).toBe("项目");
    expect(projectCrumbLabel("  ")).toBe("项目");
    expect(projectCrumbLabel("AI驱动的帕金森病")).toBe("AI驱动的帕金森病");
  });

  it("does not render a raw proj-* id even if it was passed as the name", () => {
    expect(projectCrumbLabel("proj-19c7527bcdff", "proj-19c7527bcdff")).toBe(
      "项目",
    );
    expect(
      workspaceBreadcrumbs({
        pathname: "/app/projects/proj-19c7527bcdff/knowledge/review/run-1",
        projectId: "proj-19c7527bcdff",
        projectName: "proj-19c7527bcdff",
      })[1]?.label,
    ).toBe("项目");
  });
});
