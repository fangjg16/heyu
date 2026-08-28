import { describe, expect, it } from "vitest";
import {
  isOpenKnDraftRunStatus,
  knDraftRunIdFromHref,
} from "./kn-draft-notice";

describe("knDraftRunIdFromHref", () => {
  it("reads run id from review path", () => {
    expect(
      knDraftRunIdFromHref(
        "/app/projects/proj-1/knowledge/review/run-abc",
      ),
    ).toBe("run-abc");
  });

  it("decodes encoded run id", () => {
    expect(
      knDraftRunIdFromHref(
        "/app/projects/p1/knowledge/review/run%2Fone",
      ),
    ).toBe("run/one");
  });

  it("returns null when missing", () => {
    expect(knDraftRunIdFromHref(null)).toBeNull();
    expect(knDraftRunIdFromHref("/app/projects/p1/knowledge")).toBeNull();
  });
});

describe("isOpenKnDraftRunStatus", () => {
  it("keeps generating / ready / failed as open todos", () => {
    expect(isOpenKnDraftRunStatus("ready")).toBe(true);
    expect(isOpenKnDraftRunStatus("generating")).toBe(true);
    expect(isOpenKnDraftRunStatus("failed")).toBe(true);
  });

  it("closes published and discarded runs", () => {
    expect(isOpenKnDraftRunStatus("published")).toBe(false);
    expect(isOpenKnDraftRunStatus("discarded")).toBe(false);
    expect(isOpenKnDraftRunStatus(null)).toBe(false);
  });
});
