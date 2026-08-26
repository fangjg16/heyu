import { describe, expect, it } from "vitest";
import {
  roleCanManageProjectUploads,
  roleCanPublishKnowledgeNetwork,
  roleCanUpdateKnowledgeNetwork,
  roleCanViewAllSessionUploads,
  roleWithCreatorFloor,
} from "./workspace-roles";

describe("roleWithCreatorFloor", () => {
  it("gives the project creator Admin, not Core", () => {
    expect(roleWithCreatorFloor("u1", "u1", null)).toBe("admin");
    expect(roleWithCreatorFloor("u1", "u1", "core")).toBe("admin");
    expect(roleWithCreatorFloor("u1", "u1", "low")).toBe("admin");
  });

  it("does not promote non-creators", () => {
    expect(roleWithCreatorFloor("u2", "u1", null)).toBe("guest");
    expect(roleWithCreatorFloor("u2", "u1", "core")).toBe("core");
  });
});

describe("Admin / Core knowledge-network and file permissions", () => {
  it("lets only Admin publish, review, or rollback the live knowledge network", () => {
    expect(roleCanPublishKnowledgeNetwork("admin")).toBe(true);
    expect(roleCanPublishKnowledgeNetwork("core")).toBe(false);
    expect(roleCanPublishKnowledgeNetwork("low")).toBe(false);
    expect(roleCanPublishKnowledgeNetwork("guest")).toBe(false);
  });

  it("lets Admin and Core update the knowledge network (drafts)", () => {
    expect(roleCanUpdateKnowledgeNetwork("admin")).toBe(true);
    expect(roleCanUpdateKnowledgeNetwork("core")).toBe(true);
    expect(roleCanUpdateKnowledgeNetwork("low")).toBe(false);
    expect(roleCanUpdateKnowledgeNetwork("mid")).toBe(false);
  });

  it("lets Admin and Core manage 项目上传 files", () => {
    expect(roleCanManageProjectUploads("admin")).toBe(true);
    expect(roleCanManageProjectUploads("core")).toBe(true);
    expect(roleCanManageProjectUploads("low")).toBe(false);
    expect(roleCanManageProjectUploads("issuer")).toBe(false);
  });

  it("lets only Admin see everyone's 对话上传 files", () => {
    expect(roleCanViewAllSessionUploads("admin")).toBe(true);
    expect(roleCanViewAllSessionUploads("core")).toBe(false);
    expect(roleCanViewAllSessionUploads("low")).toBe(false);
  });
});
