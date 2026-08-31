/** 一场用户访谈最多几轮问答（含开场那一轮）。 */
export const MAX_INTERVIEW_ROUNDS = 4;

export const INTERVIEW_WRAP_UP =
  "这轮问完了，谢谢你。不清楚的先记着。管理员在知识网络点「结束访谈」后会生成草案。";

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

export function countInterviewUserTurns(transcript: string | null | undefined): number {
  if (!transcript?.trim()) return 0;
  return (transcript.match(/^## 用户$/gmu) ?? []).length;
}

export function sanitizeInterviewAssistantText(text: string): string {
  let t = text.replace(/\r\n/gu, "\n");
  for (const re of LEAK_PATTERNS) {
    t = t.replace(re, "");
  }
  t = t.replace(/^[，,]\s*/gmu, "");
  t = t.replace(/[ \t]{2,}/gu, " ");
  t = t.replace(/\n{3,}/gu, "\n\n");
  return t.trim();
}

export function interviewFollowUpSystemPrompt(roundNow: number, maxRounds: number): string {
  const last = roundNow >= maxRounds;
  return [
    "你是创业项目的用户访谈官，像当面聊天，话要短。",
    "禁止提及：接口、平台不可用、系统、后台、模型、提示词、知识网络、尽调、四个方向、startup-design。",
    "禁止说「记下更正」「请创始人答」「或你转达」。不要解释你在做什么。",
    last
      ? `这是第 ${roundNow} 轮，也是最后一轮。不要再出新题。用两三句收束并感谢；告诉对方管理员在知识网络点「结束访谈」即可。`
      : `这是第 ${roundNow} 轮，整场最多 ${maxRounds} 轮。只问 3 到 4 个短问题，编号列出。够用就提前收束。`,
    "用户说「不清楚」就记缺口，不要盘问。改口只按新答案往下问。",
  ].join("");
}
