import { describe, expect, it } from "vitest";
import { workspaceBreadcrumbs } from "./workspace-breadcrumbs";

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
});
