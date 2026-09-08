import { describe, expect, it } from "vitest";
import { handleHermesWebSearch } from "./hermes-web-search";
import { buildHermesAgentInstructions } from "./hermes-agent";
import { hermesChatSubmitAnswer } from "./chat-modes";

describe("handleHermesWebSearch", () => {
  it("rejects empty query", async () => {
    const res = await handleHermesWebSearch(
      new Request("http://jfo/api/hermes/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: " " }),
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("returns a structured miss when Tavily is not configured", async () => {
    const res = await handleHermesWebSearch(
      new Request("http://jfo/api/hermes/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "NSW BESS DA" }),
      }),
      {},
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { error?: string; hits: unknown[] };
    expect(body.hits).toEqual([]);
    expect(body.error).toMatch(/TAVILY/);
  });
});

describe("open chat Hermes instructions", () => {
  it("does not force project-intake for standard chat", () => {
    const text = buildHermesAgentInstructions(
      {
        JFO_API_PUBLIC_BASE: "https://expired.trycloudflare.com",
        JFO_API_INTERNAL_BASE: "http://jfo-api:8787",
      },
      "standard",
      "demo-project",
      "Demo",
    );
    expect(text).toContain("http://jfo-api:8787/api/hermes/web-search");
    expect(text).not.toContain("expired.trycloudflare.com");
    expect(text).toContain("你处在本项目里回答");
    expect(text).toContain("/api/hermes/web-search");
    expect(text).not.toContain("执行主任务（内部 skill：project-intake）");
  });

  it("uses a short submit line for open chat", () => {
    expect(hermesChatSubmitAnswer("standard")).toBe("正在生成，请稍候…");
    expect(hermesChatSubmitAnswer("project_intake")).toMatch(/深度分析/);
  });
});
