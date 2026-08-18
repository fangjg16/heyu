import { describe, expect, it } from "vitest";
import { clerkDisplayName, clerkUsernameCandidate } from "./clerk-profile";

describe("clerkUsernameCandidate", () => {
  it("prefers unsafe_metadata.preferredUsername over Clerk username", () => {
    expect(
      clerkUsernameCandidate({
        id: "user_1",
        username: "generated_name",
        unsafe_metadata: { preferredUsername: "jianguangfang" },
        email_addresses: [{ email_address: "jianguangfang@126.com" }],
      }),
    ).toBe("jianguangfang");
  });

  it("falls back to email local part", () => {
    expect(
      clerkUsernameCandidate({
        id: "user_1",
        email_addresses: [{ email_address: "jianguangfang@126.com" }],
      }),
    ).toBe("jianguangfang");
  });
});

describe("clerkDisplayName", () => {
  it("uses preferred username when Clerk has no name", () => {
    expect(
      clerkDisplayName({
        id: "user_1",
        unsafe_metadata: { preferredUsername: "jianguangfang" },
        email_addresses: [{ email_address: "jianguangfang@126.com" }],
      }),
    ).toBe("jianguangfang");
  });
});
