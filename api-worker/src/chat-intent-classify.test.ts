import { describe, expect, it } from "vitest";
import {
  parseChatIntentClassification,
  resolveClassifiedChatIntent,
  shouldClassifyChatIntent,
} from "./chat-intent-classify";

describe("chat intent recall", () => {
  it("does not recall a lone 风险 question", () => {
    expect(shouldClassifyChatIntent("这个方向有风险吗", "early")).toBe(false);
    expect(shouldClassifyChatIntent("帮我分析一下这段话", "early")).toBe(false);
  });

  it("recalls catalog phrases including 除了…", () => {
    expect(shouldClassifyChatIntent("想要风险清单", "early")).toBe(true);
    expect(shouldClassifyChatIntent("除了风险清单，写商业模式", "early")).toBe(
      true,
    );
    expect(shouldClassifyChatIntent("除了风险清单，今天先闲聊", "early")).toBe(
      true,
    );
    expect(shouldClassifyChatIntent("帮我做个尽调", "early")).toBe(true);
  });

  it("does not classify slash skill names", () => {
    expect(shouldClassifyChatIntent("/startup-design 随便聊聊", "early")).toBe(
      false,
    );
  });
});

describe("chat intent parse", () => {
  const earlyIds = [
    "risk-analysis",
    "business-model",
    "competitor-landscape",
  ];

  it("reads fileId from JSON", () => {
    expect(
      parseChatIntentClassification(
        '{"fileId":"business-model"}',
        earlyIds,
      ),
    ).toEqual({ action: "file", fileId: "business-model" });
  });

  it("maps 除了风险清单 to the remaining file, not risk-analysis", () => {
    const classified = parseChatIntentClassification(
      '{"fileId":"business-model"}',
      earlyIds,
    );
    expect(resolveClassifiedChatIntent(classified, "early")).toEqual({
      chatMode: "startup_design",
      persistIntent: "business-model",
    });
  });

  it("treats none as ordinary chat even if the sentence mentioned 风险清单", () => {
    const classified = parseChatIntentClassification(
      '{"fileId":"none"}',
      earlyIds,
    );
    expect(resolveClassifiedChatIntent(classified, "early")).toEqual({
      chatMode: "standard",
      persistIntent: "standard",
    });
  });

  it("maps generic_intake to startup-design on early projects", () => {
    const classified = parseChatIntentClassification(
      '{"fileId":"generic_intake"}',
      earlyIds,
    );
    expect(resolveClassifiedChatIntent(classified, "early")).toEqual({
      chatMode: "startup_design",
      persistIntent: "startup_design",
    });
  });

  it("rejects unknown ids so the caller can fall back", () => {
    expect(
      parseChatIntentClassification('{"fileId":"risk-matrix"}', earlyIds),
    ).toBeNull();
  });
});
