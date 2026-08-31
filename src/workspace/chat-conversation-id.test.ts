import { describe, expect, it } from "vitest";
import {
  conversationBelongsToProject,
  inferProjectIdFromConversationId,
  isInterviewConversationId,
} from "./chat-conversation-id";

describe("interview conversation ids", () => {
  const projectId = "proj-ab12cd34";

  it("treats new interview threads as belonging to the project", () => {
    const id = `${projectId}-interview-1-a1b2c3d4`;
    expect(conversationBelongsToProject(id, projectId)).toBe(true);
    expect(inferProjectIdFromConversationId(id)).toBe(projectId);
    expect(isInterviewConversationId(id)).toBe(true);
  });

  it("still recognizes legacy interview-{projectId}- ids", () => {
    const id = `interview-${projectId}-2-deadbeef`;
    expect(conversationBelongsToProject(id, projectId)).toBe(true);
    expect(inferProjectIdFromConversationId(id)).toBe(projectId);
    expect(isInterviewConversationId(id)).toBe(true);
  });

  it("does not confuse interview ids with another project", () => {
    const id = `${projectId}-interview-1-a1b2c3d4`;
    expect(conversationBelongsToProject(id, "proj-ffffffffffff")).toBe(false);
  });
});
