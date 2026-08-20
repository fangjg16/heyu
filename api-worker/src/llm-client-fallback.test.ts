import { describe, expect, it } from "vitest";
import {
  humanizeUpstreamLlmError,
  isRetryableLlmError,
  shouldFallbackToDashscope,
} from "./llm-client";

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

describe("isRetryableLlmError", () => {
  it("retries rate limits and transient network failures", () => {
    expect(isRetryableLlmError("Rate limit exceeded, 429")).toBe(true);
    expect(isRetryableLlmError("模型请求过于频繁，请稍后重试。")).toBe(true);
    expect(isRetryableLlmError("fetch failed")).toBe(true);
    expect(isRetryableLlmError("千问 HTTP 502")).toBe(true);
  });

  it("does not retry missing credentials", () => {
    expect(isRetryableLlmError("未配置 DASHSCOPE_API_KEY")).toBe(false);
    expect(isRetryableLlmError("Unauthorized")).toBe(false);
  });
});
