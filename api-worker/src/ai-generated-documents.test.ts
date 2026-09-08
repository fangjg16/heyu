import { describe, expect, it } from "vitest";
import {
  formatAgentPersistSuccessNote,
  persistAgentAnswerAsMarkdown,
  persistAgentAnswerAsMarkdownWithRetry,
  persistMarkdownAtPath,
  shouldTellUserPersistFailed,
  withAgentPersistChatNote,
} from "./ai-generated-documents";

const ANALYSIS = `核心结论

市场并不空白。家办投研工具把材料做成了档案柜，没有做成判断。

一、竞争者总览

六类对手：垂直家办 OS、通用知识库、咨询外包、Excel 流程、内部自建、新入场大模型套壳。

二、功能矩阵

对战卡按产品、交付、收费、证据四列写。缺公开数据处标待补。
`.repeat(4);

const RECEIPT = `竞争格局 Markdown 总文件已写完。

文件已写入 \`AI生成/startup/01-discovery/competitor-landscape.md\`，按 \`startup-competitors\` 方法组织。

下一层知识网络可直接据此填写章节模板。`;

function mockEnv(opts?: {
  kind?: string | null;
  put?: () => Promise<void>;
}) {
  const documents: Array<Record<string, unknown>> = [];
  const env = {
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async first() {
                if (sql.includes("analysis_kind")) {
                  return { analysis_kind: opts?.kind ?? "early" };
                }
                if (sql.includes("FROM documents")) return null;
                return null;
              },
              async all() {
                return { results: [] };
              },
              async run() {
                if (/INSERT INTO documents/i.test(sql)) {
                  documents.push({ sql, args });
                }
                return {};
              },
            };
          },
        };
      },
    },
    FILES: {
      async put() {
        if (opts?.put) return opts.put();
      },
      async get() {
        return null;
      },
    },
  };
  return { env, documents };
}

describe("persistAgentAnswerAsMarkdown", () => {
  it("writes competitor-landscape.md for the early catalog intent", async () => {
    const { env, documents } = mockEnv();
    const result = await persistAgentAnswerAsMarkdown(
      env as never,
      {
        id: "job-1",
        project_id: "proj-1",
        user_id: "user-1",
        conversation_id: "conv-1",
        skill_intent: "competitor-landscape",
        created_at: "2026-09-08T00:00:00.000Z",
      },
      ANALYSIS,
    );
    expect(result).toMatchObject({
      ok: true,
      relativePath: "AI生成/startup/01-discovery",
      filename: "competitor-landscape.md",
      skillName: "startup-competitors",
      title: "竞争格局",
    });
    expect(documents.length).toBeGreaterThan(0);
    expect(documents[0]?.args).toContain("competitor-landscape.md");
    expect(documents[0]?.args).toContain("AI生成/startup/01-discovery");
  });

  it("refuses write receipts instead of saving them as the file", async () => {
    const { env, documents } = mockEnv();
    const result = await persistAgentAnswerAsMarkdown(
      env as never,
      {
        id: "job-1",
        project_id: "proj-1",
        user_id: "user-1",
        conversation_id: "conv-1",
        skill_intent: "competitor-landscape",
        created_at: "2026-09-08T00:00:00.000Z",
      },
      RECEIPT,
    );
    expect(result).toEqual({ ok: false, reason: "write_receipt" });
    expect(documents).toHaveLength(0);
  });

  it("returns write_failed when object storage throws", async () => {
    const { env } = mockEnv({
      put: async () => {
        throw new Error("MinIO down");
      },
    });
    const result = await persistAgentAnswerAsMarkdown(
      env as never,
      {
        id: "job-1",
        project_id: "proj-1",
        user_id: "user-1",
        conversation_id: "conv-1",
        skill_intent: "competitor-landscape",
        created_at: "2026-09-08T00:00:00.000Z",
      },
      ANALYSIS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("write_failed");
      expect(result.error).toContain("MinIO down");
    }
  });

  it("retries write_failed then succeeds", async () => {
    let calls = 0;
    const { env } = mockEnv({
      put: async () => {
        calls += 1;
        if (calls < 2) throw new Error("transient");
      },
    });
    const result = await persistAgentAnswerAsMarkdownWithRetry(
      env as never,
      {
        id: "job-1",
        project_id: "proj-1",
        user_id: "user-1",
        conversation_id: "conv-1",
        skill_intent: "competitor-landscape",
        created_at: "2026-09-08T00:00:00.000Z",
      },
      ANALYSIS,
      3,
    );
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("skips knowledge_network", async () => {
    const { env } = mockEnv();
    const result = await persistAgentAnswerAsMarkdown(
      env as never,
      {
        id: "job-1",
        project_id: "proj-1",
        user_id: "user-1",
        conversation_id: "conv-1",
        skill_intent: "knowledge_network",
        created_at: "2026-09-08T00:00:00.000Z",
      },
      ANALYSIS,
    );
    expect(result).toEqual({ ok: false, reason: "no_path" });
  });
});

describe("shouldTellUserPersistFailed", () => {
  it("nags on write failure and receipt, not on no_path", () => {
    expect(
      shouldTellUserPersistFailed({ ok: false, reason: "write_failed" }, ANALYSIS),
    ).toBe(true);
    expect(
      shouldTellUserPersistFailed({ ok: false, reason: "write_receipt" }, RECEIPT),
    ).toBe(true);
    expect(
      shouldTellUserPersistFailed({ ok: false, reason: "no_path" }, ANALYSIS),
    ).toBe(false);
    expect(
      shouldTellUserPersistFailed(
        {
          ok: true,
          documentId: "x",
          relativePath: "a",
          filename: "b.md",
          skillName: "startup-competitors",
          title: "竞争格局",
        },
        ANALYSIS,
      ),
    ).toBe(false);
  });
});

describe("withAgentPersistChatNote", () => {
  it("appends skill name and stored path after a successful write", () => {
    const note = formatAgentPersistSuccessNote({
      skillName: "startup-competitors",
      title: "竞争格局",
      relativePath: "AI生成/startup/01-discovery",
      filename: "competitor-landscape.md",
    });
    expect(note).toContain("系统 skill 「startup-competitors」（竞争格局）");
    expect(note).toContain(
      "生成的文件已保存在源文件：AI生成/startup/01-discovery/competitor-landscape.md",
    );
    const chat = withAgentPersistChatNote(ANALYSIS, {
      ok: true,
      documentId: "doc-1",
      relativePath: "AI生成/startup/01-discovery",
      filename: "competitor-landscape.md",
      skillName: "startup-competitors",
      title: "竞争格局",
    });
    expect(chat.startsWith(ANALYSIS.trimEnd())).toBe(true);
    expect(chat).toContain("startup-competitors");
    expect(chat).toContain(
      "AI生成/startup/01-discovery/competitor-landscape.md",
    );
  });

  it("does not duplicate the success note", () => {
    const once = withAgentPersistChatNote(ANALYSIS, {
      ok: true,
      documentId: "doc-1",
      relativePath: "AI生成/startup/01-discovery",
      filename: "competitor-landscape.md",
      skillName: "startup-competitors",
      title: "竞争格局",
    });
    expect(withAgentPersistChatNote(once, {
      ok: true,
      documentId: "doc-1",
      relativePath: "AI生成/startup/01-discovery",
      filename: "competitor-landscape.md",
      skillName: "startup-competitors",
      title: "竞争格局",
    })).toBe(once);
  });

  it("appends the retry hint when write fails", () => {
    const chat = withAgentPersistChatNote(ANALYSIS, {
      ok: false,
      reason: "write_failed",
    });
    expect(chat).toContain("这份分析还没写进源文件，请再生成一次。");
  });
});

describe("persistMarkdownAtPath", () => {
  it("still returns a document id when cache invalidate is missing", async () => {
    const { env } = mockEnv();
    const id = await persistMarkdownAtPath(env as never, {
      projectId: "proj-1",
      userId: "user-1",
      relativePath: "AI生成/startup/01-discovery",
      filename: "competitor-landscape.md",
      body: ANALYSIS,
      sourceKind: "ai_generated",
      fileCategory: "竞争格局",
    });
    expect(id).toBeTruthy();
  });
});
