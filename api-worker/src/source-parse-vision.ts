import {
  attachVisionToLastUserMessage,
  vlModelName,
  type ChatVisionImage,
} from "./chat-vision";
import { looksLikeOcrGaveUp, looksLikeUnparsedPlaceholder } from "./extract-document-text";
import type { LlmCallOptions, LlmMessage } from "./llm-client";

const PARSE_JSON_FIELDS = `输出唯一 JSON 对象，字段：
{"summary":"不超过220字的投研向摘要","documentType":"必须是下列之一：项目介绍、定位与进展、对标与竞品、行业与市场、财务与估值、法律与合规、股权与主体、尽调材料、其他","keyPoints":["要点"],"refs":["可引用主题"],"usedFor":["投研用途建议"]}
summary 必须是完整句子，约 120–220 字；keyPoints、refs、usedFor 各最多 6 条；无内容用空数组。
summary 是 JSON 字符串：内部英文双引号必须写成 \\"，专名优先用「」或『』。
refs、usedFor 必须是不超过 16 字的中文短词；禁止 URL。
documentType 只输出上列短标签本身。`;

export const PARSE_TEXT_SYSTEM = `你是投研工作台的源文件解析助手。根据给定文件正文摘录，输出 JSON（不要 markdown 围栏，不要其它说明）。
规则：
1. 只依据原文，禁止编造原文未出现的事实、数据、主体或结论。
2. 若信息不足，在 summary 中如实说明「原文未披露…」，不要猜测。
3. ${PARSE_JSON_FIELDS}`;

export const PARSE_VISION_SYSTEM = `你是投研工作台的源文件解析助手。这是扫描件或图片，请直接阅读图面（注记、编号、四至、图例、几何关系、权属标注），不要只根据文件名或 OCR 摘录臆测。
规则：
1. 图上看得见的必须写入 summary；禁止因为「没有可复制文字」就写成原文未披露。
2. 图上看不见的不要编造（尤其是面积、坐标、价格）。
3. ${PARSE_JSON_FIELDS}`;

export function sourceParseVisionLlmOptions(env: {
  QWEN_VL_MODEL?: string;
}): LlmCallOptions {
  return { forceDashscope: true, model: vlModelName(env) };
}

export function buildSourceFileParseMessages(opts: {
  filename: string;
  mime: string | null;
  sourceText: string;
  images: ChatVisionImage[];
}): LlmMessage[] {
  const ocrUsable =
    opts.sourceText.trim() &&
    !looksLikeUnparsedPlaceholder(opts.sourceText) &&
    !looksLikeOcrGaveUp(opts.sourceText);
  const textLines = [
    `文件名：${opts.filename}`,
    `MIME：${opts.mime || "未知"}`,
    "",
    ocrUsable
      ? "【OCR/正文摘录（辅助，以图面为准）】\n" + opts.sourceText
      : "【说明】本地抽字或 OCR 没有可用正文，请只根据图面作答。",
  ];
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: opts.images.length > 0 ? PARSE_VISION_SYSTEM : PARSE_TEXT_SYSTEM,
    },
    { role: "user", content: textLines.join("\n") },
  ];
  if (opts.images.length === 0) return messages;
  return attachVisionToLastUserMessage(messages, opts.images);
}
