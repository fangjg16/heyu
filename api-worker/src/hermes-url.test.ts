import { describe, expect, it } from "vitest";
import {
  listHermesChatCompletionsUrls,
  listHermesRunsPostUrls,
  normalizeHermesBaseUrl,
} from "./hermes-url";

describe("normalizeHermesBaseUrl", () => {
  it("keeps the Node helper proxy path so Worker calls do not collapse to :8787/", () => {
    expect(
      normalizeHermesBaseUrl("http://127.0.0.1:8787/__jfo/internal/hermes"),
    ).toBe("http://127.0.0.1:8787/__jfo/internal/hermes");
    expect(
      listHermesChatCompletionsUrls("http://127.0.0.1:8787/__jfo/internal/hermes"),
    ).toContain("http://127.0.0.1:8787/__jfo/internal/hermes/v1/chat/completions");
    expect(
      listHermesRunsPostUrls("http://127.0.0.1:8787/__jfo/internal/hermes"),
    ).toContain("http://127.0.0.1:8787/__jfo/internal/hermes/v1/runs");
  });

  it("still strips a trailing slash on a host-only Hermes URL", () => {
    expect(normalizeHermesBaseUrl("http://hermes:8642/")).toBe("http://hermes:8642");
  });
});
