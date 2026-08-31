const LEAK_PATTERNS: RegExp[] = [
  /项目资料平台接口暂时不可用[^。\n]{0,80}[。.]?/gu,
  /接口暂时不可用[^。\n]{0,40}[。.]?/gu,
  /我直接基于你给的四个方向提问[。.]?/gu,
  /基于你给的四个方向提问[。.]?/gu,
  /记下更正[：:][^。\n]*[。.]?/gu,
  /请(?:由)?创始人答[^。\n,，]{0,20}/gu,
  /或你转达后回答我[：:]?/gu,
  /startup-design/giu,
];

/** 模型收工标记，展示前剥掉。 */
export const INTERVIEW_COMPLETE_MARKER = "<<<INTERVIEW_COMPLETE>>>";

/** 收工时用户看到的最后一句。 */
export const INTERVIEW_WRAP_LINE = "材料够了，开始生成知识网络。";

/** 至少答过这么多轮才允许收工（开场那批算第 1 轮）。 */
export const INTERVIEW_MIN_CLOSE_TURNS = 2;

/** 到这一轮无论模型想不想问，都强制收工。 */
export const INTERVIEW_FORCE_CLOSE_TURNS = 3;

export function countInterviewUserTurns(transcript: string | null | undefined): number {
  if (!transcript?.trim()) return 0;
  return (transcript.match(/^## 用户$/gmu) ?? []).length;
}

export function sanitizeInterviewAssistantText(text: string): string {
  let t = text.replace(/\r\n/gu, "\n");
  t = t.replaceAll(INTERVIEW_COMPLETE_MARKER, "");
  for (const re of LEAK_PATTERNS) {
    t = t.replace(re, "");
  }
  t = t.replace(/^[，,]\s*/gmu, "");
  t = t.replace(/[ \t]{2,}/gu, " ");
  t = t.replace(/\n{3,}/gu, "\n\n");
  return t.trim();
}

export function parseInterviewLlmOutput(raw: string): {
  visible: string;
  markedComplete: boolean;
} {
  const markedComplete = raw.includes(INTERVIEW_COMPLETE_MARKER);
  return {
    visible: sanitizeInterviewAssistantText(raw),
    markedComplete,
  };
}

export function interviewLooksWrapped(text: string): boolean {
  return /材料够了/u.test(text) && /开始生成知识网络/u.test(text);
}

export function interviewShouldClose(
  userTurns: number,
  llm: { markedComplete: boolean; visible: string },
): boolean {
  if (userTurns < INTERVIEW_MIN_CLOSE_TURNS) return false;
  if (userTurns >= INTERVIEW_FORCE_CLOSE_TURNS) return true;
  return llm.markedComplete || interviewLooksWrapped(llm.visible);
}

export function ensureInterviewWrapLine(visible: string): string {
  const t = visible.trim();
  if (interviewLooksWrapped(t)) return t;
  if (!t || t === "请继续回答上面的问题。") return INTERVIEW_WRAP_LINE;
  return `${t}\n\n${INTERVIEW_WRAP_LINE}`;
}

export function interviewFollowUpSystemPrompt(userTurns: number): string {
  const closeRules =
    userTurns >= INTERVIEW_FORCE_CLOSE_TURNS
      ? `现在必须收工：禁止再提问。用两三句复述你听懂的要点（含缺口），最后一句必须是「${INTERVIEW_WRAP_LINE}」全文末尾单独一行写 ${INTERVIEW_COMPLETE_MARKER}。`
      : userTurns >= INTERVIEW_MIN_CLOSE_TURNS
        ? `已到第 ${userTurns} 轮。五个块大体齐了就收工：两三句复述要点，最后一句「${INTERVIEW_WRAP_LINE}」，末行 ${INTERVIEW_COMPLETE_MARKER}。只有还缺一块关键事实才再问一批 3 到 5 题，不要盘问不清楚。`
        : `这是第 ${userTurns} 轮，不要收工。针对含糊最多追一次，并补还没问到的块，一次 3 到 5 个短问题编号列出。不要喊「下一轮」。不要写 ${INTERVIEW_COMPLETE_MARKER}。`;
  return [
    "你是创业项目的用户访谈官，像当面聊天，话要短。",
    "禁止提及：接口、平台不可用、系统、后台、模型、提示词、尽调、四个方向、startup-design、结束访谈、去知识网络页。",
    "禁止说「记下更正」「请创始人答」「或你转达」。不要解释你在做什么。",
    "覆盖：想法（问题/方案/为何现在）、创始人、市场（客户/竞品/地理）、商业（怎么赚钱/定价/成功标准）、约束。含糊只追一次。硬问题（凭什么是你、巨头来了怎么办、最强反驳、真正和客户说过什么）能问则问，不必一次问完。",
    "用户说「不清楚」就记缺口往下走。材料里已有的题跳过。改口只按新答案。",
    closeRules,
  ].join("");
}
