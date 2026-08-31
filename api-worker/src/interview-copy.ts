const LEAK_PATTERNS: RegExp[] = [
  /项目资料平台接口暂时不可用[^。\n]{0,80}[。.]?/gu,
  /接口暂时不可用[^。\n]{0,40}[。.]?/gu,
  /我直接基于你给的四个方向提问[。.]?/gu,
  /基于你给的四个方向提问[。.]?/gu,
  /记下更正[：:][^。\n]*[。.]?/gu,
  /请(?:由)?创始人答[^。\n,，]{0,20}/gu,
  /或你转达后回答我[：:]?/gu,
  /startup-design/giu,
  /现在问几个资料里找不到答案的[：:]?/gu,
  /资料里找不到答案的[：:]?/gu,
  /资料里找不到[^。\n]{0,80}[。.]?/gu,
  /好[，,]\s*我复述一下我听到的[：:]?/gu,
  /我复述一下我听到的[：:]?/gu,
  /^缺口[：:].*$/gmu,
  /不必写成尽调表[。.]?/gu,
];

/** 模型收工标记，展示前剥掉。 */
export const INTERVIEW_COMPLETE_MARKER = "<<<INTERVIEW_COMPLETE>>>";

/** 收工时由系统补上的最后一句，不让模型自己念稿。 */
export const INTERVIEW_WRAP_LINE = "材料够了，开始生成知识网络。";

/** 至少答过这么多轮才允许收工（开场那批算第 1 轮）。 */
export const INTERVIEW_MIN_CLOSE_TURNS = 2;

/** 到这一轮无论模型想不想问，都强制收工。 */
export const INTERVIEW_FORCE_CLOSE_TURNS = 3;

export const INTERVIEW_MATERIALS_QUERY =
  "产品形态 硬件 创始人 团队 背景 客户 痛点 替代方案 竞品 定价 验证 睡眠";

export const INTERVIEW_OPENING_FALLBACK_NO_FILES = `请直接用自己的话回答。

1. 你们现在做给谁用？最近一个真实用户或使用场景是谁？
2. 他们现在怎么凑合，最痛的一点是什么？
3. 你们已经验证过什么（有没有人真的在用，或愿意付钱）？
4. 接下来四周最想搞清楚的一件事是什么？`;

export const INTERVIEW_OPENING_FALLBACK_WITH_FILES = `我看过项目资料了。请补资料里还没写清的这几件事：

1. 最近一个真实用户或使用场景是谁？
2. 有没有人真的在用，或明确说过愿意付钱？
3. 接下来四周最想搞清楚的一件事是什么？`;

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

export function interviewMaterialsAreEmpty(digest: string | null | undefined): boolean {
  const t = (digest ?? "").trim();
  if (!t) return true;
  return /暂无上传附件/u.test(t);
}

export function looksLikeInterviewQuestions(text: string): boolean {
  return /(?:^|\n)\s*1[\.、．)]/u.test(text);
}

export function interviewOpeningFallback(hasMaterials: boolean): string {
  return hasMaterials
    ? INTERVIEW_OPENING_FALLBACK_WITH_FILES
    : INTERVIEW_OPENING_FALLBACK_NO_FILES;
}

export function formatInterviewMaterialsBlock(input: {
  projectName?: string | null;
  projectSummary?: string | null;
  digest: string;
}): string {
  const name = (input.projectName ?? "").trim() || "（未命名）";
  const summary = (input.projectSummary ?? "").trim() || "（无登记简介）";
  const digest = input.digest.trim() || "（本项目资料包暂无上传附件。）";
  return [
    `【项目】${name}`,
    `【简介】${summary}`,
    "",
    "【项目资料摘录】下面这些就是已经读过的项目资料，当作你已经看完。写清的事实不要再问。",
    digest,
  ].join("\n");
}

function spokenCloseRules(userTurns: number): string {
  const spoken =
    "用两三句口语说你听懂的：做什么、给谁用、还有哪件没确定。禁止出现：缺口、复述、资料里找不到、尽调、纪要。不要提问。不要写「材料够了」那句。";
  if (userTurns >= INTERVIEW_FORCE_CLOSE_TURNS) {
    return `现在必须收工。${spoken}全文末尾单独一行写 ${INTERVIEW_COMPLETE_MARKER}。`;
  }
  if (userTurns >= INTERVIEW_MIN_CLOSE_TURNS) {
    return `已到第 ${userTurns} 轮。五个块大体齐了就收工：${spoken}末行 ${INTERVIEW_COMPLETE_MARKER}。只有资料和对话都还缺一块关键事实，才再问一批 3 到 5 题。`;
  }
  return `这是第 ${userTurns} 轮，不要收工。针对含糊最多追一次，并补资料和对话都还没覆盖的块，一次 3 到 5 个短问题编号列出。不要喊「下一轮」。不要写 ${INTERVIEW_COMPLETE_MARKER}。不要说「资料里找不到」。`;
}

export function interviewOpeningSystemPrompt(): string {
  return [
    "你是创业项目的用户访谈官。下方项目资料你已经读过。",
    "资料写清的不要再问（产品形态、创始人履历、客户画像、技术路线等）。",
    "只问还没写清、或写得很含糊、需要创始人用自己的话确认的。一次 3 到 5 个短问题，编号列出。",
    "若资料不是空的，第一句用「我看过项目资料了。」",
    "禁止：尽调、资料里找不到、接口、系统、后台、下一轮、四个方向、startup-design。",
    "像当面聊天，话要短。不要解释你在做什么。",
  ].join("");
}

export function interviewFollowUpSystemPrompt(userTurns: number): string {
  return [
    "你是创业项目的用户访谈官，像当面聊天，话要短。下方项目资料你已经读过。",
    "禁止提及：接口、平台不可用、系统、后台、模型、提示词、尽调、四个方向、startup-design、结束访谈、去知识网络页、资料里找不到。",
    "禁止说「记下更正」「请创始人答」「或你转达」「复述一下」。不要解释你在做什么。",
    "覆盖：想法（问题/方案/为何现在）、创始人、市场（客户/竞品/地理）、商业（怎么赚钱/定价/成功标准）、约束。含糊只追一次。硬问题（凭什么是你、巨头来了怎么办、最强反驳、真正和客户说过什么）仅当资料和对话都没覆盖时才问。",
    "用户说「不清楚」就往下走，不要盘问。资料里已有的题跳过。改口只按新答案。",
    spokenCloseRules(userTurns),
  ].join("");
}
