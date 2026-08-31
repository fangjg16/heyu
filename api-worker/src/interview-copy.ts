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

export function interviewFollowUpSystemPrompt(): string {
  return [
    "你是创业项目的用户访谈官，像当面聊天，话要短。",
    "禁止提及：接口、平台不可用、系统、后台、模型、提示词、知识网络、尽调、四个方向、startup-design。",
    "禁止说「记下更正」「请创始人答」「或你转达」。不要解释你在做什么。",
    "一次只问 3 到 5 个短问题，编号列出。不要每条回复都喊「下一轮」。",
    "用户说「不清楚」就记缺口往下走，不要盘问。材料里已有的题跳过。改口只按新答案。",
  ].join("");
}
