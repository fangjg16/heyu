import { afterEach, describe, expect, it } from "vitest";
import {
  clearMyProjectRoles,
  setMyProjectRoles,
} from "./project-role-cache";
import { decideChatStay, canAttemptProjectChat } from "./workspace-users";

describe("decideChatStay", () => {
  afterEach(() => {
    clearMyProjectRoles();
  });

  it("waits when a member project is loaded but roles are not ready yet", () => {
    expect(
      decideChatStay({
        userId: "jimmy-huang",
        projectId: "proj-zeiss",
        createdBy: "jessica-hu",
        analysisKind: "mature",
        projectFound: true,
        rolesReady: false,
      }),
    ).toBe("wait");
  });

  it("lets Core stay after roles land", () => {
    setMyProjectRoles({ "proj-zeiss": "core" });
    expect(
      decideChatStay({
        userId: "jimmy-huang",
        projectId: "proj-zeiss",
        createdBy: "jessica-hu",
        analysisKind: "mature",
        projectFound: true,
        rolesReady: true,
      }),
    ).toBe("stay");
  });

  it("allows entering chat while membership is still unknown", () => {
    expect(
      canAttemptProjectChat({
        userId: "jimmy-huang",
        projectId: "proj-zeiss",
        createdBy: "jessica-hu",
        analysisKind: "mature",
      }),
    ).toBe(true);
  });

  it("sends a confirmed guest to the project library", () => {
    setMyProjectRoles({ "proj-zeiss": "guest" });
    expect(
      decideChatStay({
        userId: "outsider",
        projectId: "proj-zeiss",
        createdBy: "jessica-hu",
        analysisKind: "mature",
        projectFound: true,
        rolesReady: true,
      }),
    ).toBe("projects");
  });

  it("does not kick when the project is present but the role table failed empty", () => {
    expect(
      decideChatStay({
        userId: "jimmy-huang",
        projectId: "proj-zeiss",
        createdBy: "jessica-hu",
        analysisKind: "mature",
        projectFound: true,
        rolesReady: true,
      }),
    ).toBe("stay");
  });

  it("sends issuer on a mature project to collab", () => {
    setMyProjectRoles({ "proj-zeiss": "issuer" });
    expect(
      decideChatStay({
        userId: "issuer-1",
        projectId: "proj-zeiss",
        createdBy: "jessica-hu",
        analysisKind: "mature",
        projectFound: true,
        rolesReady: true,
      }),
    ).toBe("collab");
  });
});
