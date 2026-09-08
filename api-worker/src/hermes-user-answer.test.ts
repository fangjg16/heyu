import { describe, expect, it } from "vitest";
import { sanitizeHermesUserFacingAnswer } from "./hermes-user-answer";
import { hermesMaterialsApiBase } from "./hermes-agent";

describe("sanitizeHermesUserFacingAnswer", () => {
  it("drops materials API outage lines and Tavily brand", () => {
    expect(
      sanitizeHermesUserFacingAnswer(
        "项目资料 API 暂时不可用。当前联网检索工具（Tavily）读不了微信。",
      ),
    ).toBe("公开检索读不了微信。");
  });
});

describe("hermesMaterialsApiBase", () => {
  it("prefers the in-compose API over the public tunnel", () => {
    expect(
      hermesMaterialsApiBase({
        JFO_API_INTERNAL_BASE: "http://jfo-api:8787",
        JFO_API_PUBLIC_BASE: "https://expired.trycloudflare.com",
      }),
    ).toBe("http://jfo-api:8787");
  });
});
