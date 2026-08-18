import { describe, expect, it } from "vitest";
import { humanizeUpstreamLlmError, shouldFallbackToDashscope } from "./llm-client";

describe("shouldFallbackToDashscope", () => {
  it("does not treat workerd Hermes connectivity failures as a reason to skip to Qwen", () => {
    expect(
      shouldFallbackToDashscope(
        "internal error; reference = 08i387m6pdb11s3fsa7beu7e",
      ),
    ).toBe(false);
    expect(shouldFallbackToDashscope("fetch failed")).toBe(false);
    expect(shouldFallbackToDashscope("DNS lookup failed; params.host = hermes")).toBe(
      false,
    );
    expect(shouldFallbackToDashscope("Hermes 上游不可达：ECONNREFUSED")).toBe(false);
  });

  it("still allows fallback when Hermes is pointed at a webpage/dashboard", () => {
    expect(
      shouldFallbackToDashscope("Hermes 返回了网页而非 API。请检查服务地址"),
    ).toBe(true);
  });
});

describe("humanizeUpstreamLlmError", () => {
  it("names Hermes instead of a generic upstream model outage", () => {
    expect(
      humanizeUpstreamLlmError("internal error; reference = abc"),
    ).toMatch(/Hermes/);
  });
});
