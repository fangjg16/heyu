import { describe, expect, it } from "vitest";
import {
  handleHermesMaterialsSearch,
  selectParsedCacheHits,
} from "./hermes-materials-search";
import type { ChunkRow } from "./search";
import { buildJfoMaterialsInstructions } from "./hermes-materials-instructions";
import { buildHermesAgentInstructions } from "./hermes-agent";

const chunks: ChunkRow[] = [
  {
    id: "p1",
    document_id: "pkg-1",
    chunk_index: 0,
    text: "南宁生鲜港一期冷库容量 12 万吨，主要服务西南农产品流通。",
    filename: "项目介绍.pdf",
    scope: "package",
  },
  {
    id: "p2",
    document_id: "pkg-2",
    chunk_index: 0,
    text: "财务模型假设内部收益率 14%，不含土地增值。",
    filename: "财务模型.xlsx",
    scope: "package",
  },
  {
    id: "s1",
    document_id: "ses-1",
    chunk_index: 0,
    text: "本对话刚上传：承租人意向函，租期 8 年。",
    filename: "意向函.pdf",
    scope: "session",
  },
];

describe("selectParsedCacheHits", () => {
  it("returns related parsed chunks instead of the whole corpus", () => {
    const hits = selectParsedCacheHits(chunks, "冷库容量有多大", { topK: 4 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.text.includes("12 万吨"))).toBe(true);
    expect(hits.some((h) => h.filename === "项目介绍.pdf")).toBe(true);
  });

  it("can stay on package scope and skip session attachments", () => {
    const hits = selectParsedCacheHits(chunks, "租期", { scope: "package" });
    expect(hits.every((h) => h.scope === "package")).toBe(true);
  });
});

describe("handleHermesMaterialsSearch", () => {
  it("rejects a missing query", async () => {
    const res = await handleHermesMaterialsSearch(
      new Request("http://jfo/api/hermes/projects/demo/search"),
      { DB: {} as never },
      "demo",
    );
    expect(res.status).toBe(400);
  });

  it("requires userId when searching session or all", async () => {
    const res = await handleHermesMaterialsSearch(
      new Request("http://jfo/api/hermes/projects/demo/search?q=冷库&scope=all"),
      { DB: {} as never },
      "demo",
    );
    expect(res.status).toBe(400);
  });
});

describe("materials instructions treat parsed uploads as standing knowledge", () => {
  it("does not make Q&A a search procedure", () => {
    const text = buildJfoMaterialsInstructions(
      "http://jfo-api:8787",
      "demo-project",
      "standard",
      "alice",
      "conv-1",
    );
    expect(text).toContain("【项目知识】");
    expect(text).toContain("不是每轮要跑的流程");
    expect(text).toContain("/api/hermes/projects/demo-project/search");
  });

  it("tells agent runs to use injected project knowledge first", () => {
    const text = buildHermesAgentInstructions(
      {
        JFO_API_PUBLIC_BASE: "https://expired.trycloudflare.com",
        JFO_API_INTERNAL_BASE: "http://jfo-api:8787",
      },
      "project_intake",
      "demo-project",
      "Demo",
      { userId: "alice", conversationId: "conv-1" },
    );
    expect(text).toContain("http://jfo-api:8787/api/hermes/projects/demo-project/search");
    expect(text).not.toContain("expired.trycloudflare.com");
    expect(text).toContain("先用已注入的项目知识");
  });
});
