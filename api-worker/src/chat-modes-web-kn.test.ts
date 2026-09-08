import { describe, expect, it } from "vitest";
import {
  detectSkillIntent,
  KNOWLEDGE_NETWORK_USE_WEB_ANSWER,
  shouldRouteToHermes,
  shouldSkipHermesForLightChat,
  USER_QUICK_PROMPTS,
  websitePlatformIdentityLines,
} from "./chat-modes";

describe("knowledge network chat is web-only", () => {
  it("still detects delivery phrasing so the chat handler can redirect", () => {
    expect(detectSkillIntent("请生成项目知识网络")).toBe("knowledge_network");
  });

  it("points users to the project page instead of whole-page HTML", () => {
    expect(KNOWLEDGE_NETWORK_USE_WEB_ANSWER).toContain("网页生成");
    expect(KNOWLEDGE_NETWORK_USE_WEB_ANSWER).not.toContain("```html");
    expect(websitePlatformIdentityLines().join("\n")).not.toContain(
      "均在对话内完成",
    );
    expect(
      USER_QUICK_PROMPTS.some((p) => p.message.includes("生成项目知识网络")),
    ).toBe(false);
  });
});

describe("due-diligence chat intents", () => {
  it("routes 商业模式尽调 to business-due-diligence, not project-intake", () => {
    expect(
      detectSkillIntent("列一个针对他们商业模式的尽调问题清单"),
    ).toBe("business_due_diligence");
    expect(detectSkillIntent("做一份商业尽调")).toBe("business_due_diligence");
  });

  it("keeps generic 尽调清单 on dd-checklist", () => {
    expect(detectSkillIntent("生成尽调清单，标出已有和还缺的材料")).toBe(
      "dd_checklist",
    );
  });

  it("keeps bare 尽调 on project-intake", () => {
    expect(detectSkillIntent("帮我做个尽调")).toBe("project_intake");
  });

  it("does not treat casual 创业搞头 questions as intake or knowledge network", () => {
    expect(
      detectSkillIntent("请帮我分析一下这个项目创业有没有搞头"),
    ).toBe("standard");
    expect(detectSkillIntent("这个项目创业有没有搞头")).toBe("standard");
  });

  it("still routes explicit depth / intake phrasing", () => {
    expect(detectSkillIntent("请做一次深度分析")).toBe("project_intake");
    expect(detectSkillIntent("全面分析这个项目")).toBe("project_intake");
    expect(detectSkillIntent("看下这个项目")).toBe("project_intake");
  });

  it("remaps generic analysis by project kind", () => {
    expect(detectSkillIntent("帮我做个尽调", "early")).toBe("startup_design");
    expect(detectSkillIntent("帮我做个尽调", "acquire")).toBe(
      "acquisition_intake",
    );
  });

  it("routes 创业风险清单 to startup-design, not capitallens risk-matrix", () => {
    expect(detectSkillIntent("想要风险清单", "early")).toBe("startup_design");
    expect(detectSkillIntent("做一版风险评估", "early")).toBe("startup_design");
    expect(detectSkillIntent("做一版风险矩阵", "early")).toBe("startup_design");
    expect(detectSkillIntent("想要风险清单")).toBe("risk_matrix");
  });

  it("forces skill by slash directory name", () => {
    expect(detectSkillIntent("/startup-design 随便聊聊")).toBe("startup_design");
    expect(detectSkillIntent("/acquisition-gate 买不买")).toBe(
      "acquisition_gate",
    );
  });

  it("routes newer specialist skills instead of project-intake", () => {
    expect(detectSkillIntent("做一份合规分析")).toBe("compliance_check");
    expect(detectSkillIntent("帮我看竞品分析")).toBe("startup_competitors");
    expect(detectSkillIntent("这个项目收购立项怎么写")).toBe(
      "acquisition_intake",
    );
    expect(detectSkillIntent("这属于什么赛道")).toBe(
      "classify_investment_theme",
    );
  });

  it("routes 对标 to industry-due-diligence, not legacy comp-analysis", () => {
    expect(detectSkillIntent("做一下市场对标")).toBe("industry_due_diligence");
    expect(detectSkillIntent("列一组可比交易")).toBe("industry_due_diligence");
  });

  it("does not treat 整理文件中的链接 as document reorganize", () => {
    expect(
      detectSkillIntent("帮我整理一下文件中链接跳转网页的信息"),
    ).toBe("standard");
    expect(
      detectSkillIntent("帮我整理文件中链接跳转网页的信息"),
    ).toBe("standard");
    expect(detectSkillIntent("帮我整理文件")).toBe("document_reorganize");
  });
});

describe("light chat streams the same model; skills still open Hermes runs", () => {
  it("treats 值不值得投 as streaming light chat, not a Hermes job", () => {
    expect(detectSkillIntent("这个项目值不值得投")).toBe("standard");
    expect(detectSkillIntent("帮我看看 帕金森这个项目值不值得投资")).toBe(
      "standard",
    );
  });

  it("keeps Hermes runs for skills; open chat streams the same model with parsed cache", () => {
    expect(shouldRouteToHermes("standard")).toBe(false);
    expect(shouldRouteToHermes("project_intake")).toBe(true);
    expect(shouldRouteToHermes("knowledge_network")).toBe(false);
    expect(shouldSkipHermesForLightChat("standard")).toBe(true);
    expect(shouldSkipHermesForLightChat("project_intake")).toBe(false);
  });
});
