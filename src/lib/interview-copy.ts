/** 用户访谈展示文案：短、不露后台。 */

export const INTERVIEW_HEADER_TOPIC = "用户访谈";

export const INTERVIEW_BANNER_ACTIVE = "用户访谈进行中，请直接回答下面的问题。";

export const INTERVIEW_BANNER_PAUSED = "访谈已暂停。管理员可在知识网络继续。";

export const INTERVIEW_BANNER_OTHER = "这是指定给其他成员的用户访谈。";

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

const INTERVIEW_COMPLETE_MARKER = "<<<INTERVIEW_COMPLETE>>>";

/** 去掉访谈官不该对用户说的系统/后台句子。 */
export function sanitizeInterviewAssistantText(text: string): string {
  let t = text.replace(/\r\n/gu, "\n");
  t = t.split(INTERVIEW_COMPLETE_MARKER).join("");
  for (const re of LEAK_PATTERNS) {
    t = t.replace(re, "");
  }
  t = t.replace(/^[，,]\s*/gmu, "");
  t = t.replace(/[ \t]{2,}/gu, " ");
  t = t.replace(/\n{3,}/gu, "\n\n");
  return t.trim();
}
