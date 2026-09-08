import { describe, expect, it } from "vitest";
import { PROJECT_FILES_CHANGED_EVENT } from "./project-files-changed";

describe("project-files-changed", () => {
  it("uses a stable event name", () => {
    expect(PROJECT_FILES_CHANGED_EVENT).toBe("heyu-project-files-changed");
  });
});
