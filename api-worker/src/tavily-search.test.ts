import { describe, expect, it } from "vitest";
import {
  extractHttpUrls,
  wantsLinkedPageFollow,
} from "./tavily-search";

describe("wantsLinkedPageFollow", () => {
  it("matches organizing webpage links inside a file", () => {
    expect(
      wantsLinkedPageFollow("帮我整理一下文件中链接跳转网页的信息"),
    ).toBe(true);
    expect(wantsLinkedPageFollow("这个项目的估值假设是什么")).toBe(false);
  });
});

describe("extractHttpUrls", () => {
  it("pulls http(s) links out of email-like PDF text", () => {
    const text = [
      "Hi Peter, two links from the newsletter:",
      "https://www.whitsundayrc.qld.gov.au/news/shute-harbour?fbclid=abc",
      "https://www.whitsundayrc.qld.gov.au/news/record-month",
    ].join("\n");
    expect(extractHttpUrls(text)).toEqual([
      "https://www.whitsundayrc.qld.gov.au/news/shute-harbour?fbclid=abc",
      "https://www.whitsundayrc.qld.gov.au/news/record-month",
    ]);
  });
});
