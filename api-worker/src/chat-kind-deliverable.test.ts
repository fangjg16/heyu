import { describe, expect, it } from "vitest";
import {
  chatDeliverableInstructionLines,
  chatDeliverablePath,
  hermesSkillForChatIntent,
  matchChatDeliverable,
  persistIntentForChat,
} from "./chat-kind-deliverable";
import { deliverableById } from "./deliverable-catalog";
import { aiGeneratedPathForIntent } from "./ai-generated-path";

describe("early chat deliverables", () => {
  it("maps 风险清单 to startup risk-analysis.md", () => {
    expect(matchChatDeliverable("early", "想要风险清单")?.id).toBe(
      "risk-analysis",
    );
    expect(persistIntentForChat("early", "想要风险清单", "startup_design")).toBe(
      "risk-analysis",
    );
    expect(chatDeliverablePath("risk-analysis", "early")).toEqual({
      pack: "startup",
      folder: "06-validation",
      filename: "risk-analysis.md",
      relativePath: "AI生成/startup/06-validation",
    });
    expect(chatDeliverablePath("risk_matrix", "early")).toEqual({
      pack: "startup",
      folder: "06-validation",
      filename: "risk-analysis.md",
      relativePath: "AI生成/startup/06-validation",
    });
    expect(hermesSkillForChatIntent("risk-analysis", "early")).toBe(
      "startup-design",
    );
    expect(hermesSkillForChatIntent("risk_matrix", "early")).toBe(
      "startup-design",
    );
  });

  it("keeps 风险矩阵 on capitallens when the project is not early", () => {
    expect(matchChatDeliverable("mature", "做一版风险矩阵")?.id).toBe(
      "risk-matrix",
    );
    expect(chatDeliverablePath("risk-matrix", "mature")).toEqual({
      pack: "capitallens",
      folder: "05-decision",
      filename: "risk-matrix.md",
      relativePath: "AI生成/capitallens/05-decision",
    });
    expect(chatDeliverablePath("risk_matrix")).toBeNull();
    expect(hermesSkillForChatIntent("risk_matrix", "mature")).toBe("risk-matrix");
    expect(aiGeneratedPathForIntent("risk_matrix")).toEqual({
      pack: "capitallens",
      folder: "05-decision",
      filename: "risk-matrix.md",
      relativePath: "AI生成/capitallens/05-decision",
    });
  });

  it("does not steal generic 尽调 into the risk file", () => {
    expect(matchChatDeliverable("early", "帮我做个尽调")).toBeNull();
    expect(persistIntentForChat("early", "帮我做个尽调", "startup_design")).toBe(
      "startup_design",
    );
    expect(chatDeliverablePath("startup_design", "early")).toBeNull();
    expect(aiGeneratedPathForIntent("startup_design")?.filename).toBe("brief.md");
  });

  it("tells the agent to write 风险清单, not the investor risk matrix", () => {
    const file = deliverableById("early", "risk-analysis");
    expect(file).toBeTruthy();
    const lines = chatDeliverableInstructionLines(file!);
    expect(lines.join("\n")).toContain(
      "AI生成/startup/06-validation/risk-analysis.md",
    );
    expect(lines.join("\n")).toContain("风险清单");
    expect(lines.join("\n")).toContain("平台会把本条回复写入资料包");
    expect(lines.join("\n")).toContain("禁止写");
    expect(lines.join("\n")).toContain("平台会自行告知用户");
    expect(lines.join("\n")).not.toContain("capitallens");
  });

  it("maps 竞争格局 to startup competitor-landscape.md", () => {
    expect(matchChatDeliverable("early", "帮我看看竞争格局")?.id).toBe(
      "competitor-landscape",
    );
    expect(
      persistIntentForChat("early", "帮我看看竞争格局", "startup_competitors"),
    ).toBe("competitor-landscape");
    expect(chatDeliverablePath("competitor-landscape", "early")).toEqual({
      pack: "startup",
      folder: "01-discovery",
      filename: "competitor-landscape.md",
      relativePath: "AI生成/startup/01-discovery",
    });
    expect(chatDeliverablePath("startup_competitors", "early")).toEqual({
      pack: "startup",
      folder: "01-discovery",
      filename: "competitor-landscape.md",
      relativePath: "AI生成/startup/01-discovery",
    });
    expect(hermesSkillForChatIntent("competitor-landscape", "early")).toBe(
      "startup-competitors",
    );
  });
});
