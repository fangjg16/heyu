/**
 * 重新排版时：英文分析只译成中文再渲页面，不改资料包原文。
 */
import { callLlm, type LlmClientEnv } from "./llm-client";
import { isEnglishHeavyMarkdown } from "./kn-md-zh";

const SYSTEM = `把下面这份分析译成简体中文，给投资人读。
要求：
- 保持原 Markdown：标题层级、表格、列表、引用、分隔线、加粗、编号都不要改。
- 保留方括号证据标签及其补充，包括 [Data]、[Opinion]、[Assumption]、[Gap]、[Estimate]、[Founder decision]、[Unknown]、[Required]，以及 [Data — company-reported]、[Data/Opinion] 这种写法。
- 公司名、产品名、人名可保留英文。
- 不要增删事实，不要解释，不要加前言或后记。只返回译文。`;

function stripFence(s: string): string {
  const t = s.trim();
  const m = /^```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```$/u.exec(t);
  return (m?.[1] ?? t).trim();
}

export async function markdownForKnDisplay(
  env: LlmClientEnv,
  md: string,
): Promise<{ markdown: string; translated: boolean }> {
  const src = (md ?? "").trim();
  if (!src || !isEnglishHeavyMarkdown(src)) {
    return { markdown: src, translated: false };
  }
  try {
    const { answer } = await callLlm(env, [
      { role: "system", content: SYSTEM },
      { role: "user", content: src },
    ]);
    const out = stripFence(String(answer ?? ""));
    if (out.length < Math.min(80, src.length * 0.3)) {
      return { markdown: src, translated: false };
    }
    return { markdown: out, translated: true };
  } catch {
    return { markdown: src, translated: false };
  }
}
