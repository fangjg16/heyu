import { describe, expect, it } from "vitest";
import {
  INTERVIEW_COMPLETE_MARKER,
  INTERVIEW_FORCE_CLOSE_TURNS,
  INTERVIEW_WRAP_LINE,
  countInterviewUserTurns,
  ensureInterviewWrapLine,
  formatInterviewMaterialsBlock,
  interviewFollowUpSystemPrompt,
  interviewMaterialsAreEmpty,
  interviewOpeningFallback,
  interviewOpeningSystemPrompt,
  interviewShouldClose,
  looksLikeInterviewQuestions,
  parseInterviewLlmOutput,
  sanitizeInterviewAssistantText,
} from "./interview-copy";

describe("countInterviewUserTurns", () => {
  it("counts user sections in the transcript", () => {
    expect(countInterviewUserTurns("")).toBe(0);
    expect(
      countInterviewUserTurns("## 用户\n答1\n\n## 访谈官\n问\n\n## 用户\n答2"),
    ).toBe(2);
  });
});

describe("sanitizeInterviewAssistantText", () => {
  it("drops leaked platform status", () => {
    expect(
      sanitizeInterviewAssistantText(
        "项目资料平台接口暂时不可用，我直接基于你给的四个方向提问。1. 客户是谁？",
      ),
    ).toBe("1. 客户是谁？");
  });

  it("strips the complete marker", () => {
    expect(
      sanitizeInterviewAssistantText(
        `要点如下。${INTERVIEW_WRAP_LINE}\n${INTERVIEW_COMPLETE_MARKER}`,
      ),
    ).toBe(`要点如下。${INTERVIEW_WRAP_LINE}`);
  });

  it("strips 'not in materials' stage directions", () => {
    expect(
      sanitizeInterviewAssistantText(
        "现在问几个资料里找不到答案的：1. 产品放在哪里？",
      ),
    ).toBe("1. 产品放在哪里？");
  });
});

describe("interviewShouldClose", () => {
  it("does not close on the first user turn even if the model marks complete", () => {
    expect(
      interviewShouldClose(1, {
        markedComplete: true,
        visible: INTERVIEW_WRAP_LINE,
      }),
    ).toBe(false);
  });

  it("closes on turn 2 when the model marks complete or uses the wrap line", () => {
    expect(
      interviewShouldClose(2, { markedComplete: true, visible: "记下了。" }),
    ).toBe(true);
    expect(
      interviewShouldClose(2, {
        markedComplete: false,
        visible: `客户是中小团队。${INTERVIEW_WRAP_LINE}`,
      }),
    ).toBe(true);
    expect(
      interviewShouldClose(2, {
        markedComplete: false,
        visible: "1. 你们怎么赚钱？",
      }),
    ).toBe(false);
  });

  it("force-closes at the cap even if the model keeps asking", () => {
    expect(
      interviewShouldClose(INTERVIEW_FORCE_CLOSE_TURNS, {
        markedComplete: false,
        visible: "1. 再问一个？",
      }),
    ).toBe(true);
  });
});

describe("ensureInterviewWrapLine", () => {
  it("uses only the wrap line when there is nothing to recap", () => {
    expect(ensureInterviewWrapLine("")).toBe(INTERVIEW_WRAP_LINE);
    expect(ensureInterviewWrapLine("请继续回答上面的问题。")).toBe(
      INTERVIEW_WRAP_LINE,
    );
  });

  it("appends the wrap line when missing", () => {
    expect(ensureInterviewWrapLine("客户是中小团队。")).toBe(
      `客户是中小团队。\n\n${INTERVIEW_WRAP_LINE}`,
    );
  });

  it("does not duplicate the wrap line", () => {
    const already = `客户是中小团队。${INTERVIEW_WRAP_LINE}`;
    expect(ensureInterviewWrapLine(already)).toBe(already);
  });
});

describe("parseInterviewLlmOutput", () => {
  it("splits marker from visible text", () => {
    const parsed = parseInterviewLlmOutput(
      `客户清楚了。${INTERVIEW_WRAP_LINE}\n${INTERVIEW_COMPLETE_MARKER}`,
    );
    expect(parsed.markedComplete).toBe(true);
    expect(parsed.visible).toContain(INTERVIEW_WRAP_LINE);
    expect(parsed.visible).not.toContain(INTERVIEW_COMPLETE_MARKER);
  });
});

describe("interviewFollowUpSystemPrompt", () => {
  it("forbids wrapping on turn 1 and requires wrap on turn 3 without stage words", () => {
    expect(interviewFollowUpSystemPrompt(1)).toContain("不要收工");
    expect(interviewFollowUpSystemPrompt(1)).toContain("资料里找不到");
    expect(interviewFollowUpSystemPrompt(3)).toContain("必须收工");
    expect(interviewFollowUpSystemPrompt(3)).not.toContain("含缺口");
    expect(interviewOpeningSystemPrompt()).toContain("已经读过");
  });
});

describe("interview materials helpers", () => {
  it("treats empty package copy as no materials", () => {
    expect(interviewMaterialsAreEmpty("")).toBe(true);
    expect(
      interviewMaterialsAreEmpty("【项目上传附件】\n（本项目资料包暂无上传附件。）"),
    ).toBe(true);
    expect(interviewMaterialsAreEmpty("── BP.pdf ──\n床头毫米波雷达")).toBe(false);
  });

  it("detects numbered opening questions", () => {
    expect(looksLikeInterviewQuestions("1. 谁在用？\n2. 怎么付钱？")).toBe(true);
    expect(looksLikeInterviewQuestions("我先看看资料。")).toBe(false);
  });

  it("formats the materials block for the interviewer", () => {
    const block = formatInterviewMaterialsBlock({
      projectName: "Somni",
      projectSummary: "睡眠设备",
      digest: "床头无屏设备",
    });
    expect(block).toContain("【项目】Somni");
    expect(block).toContain("已经读过的项目资料");
    expect(block).toContain("床头无屏设备");
  });

  it("uses a materials-aware fallback when files exist", () => {
    expect(interviewOpeningFallback(true)).toContain("我看过项目资料了");
    expect(interviewOpeningFallback(false)).toContain("做给谁用");
    expect(interviewOpeningFallback(false)).not.toContain("尽调");
  });
});
