import type { AppDatabase } from "./app-database";
import {
  buildCitationSystemLines,
  citationMapFromSlots,
  getCitationSlots,
  matchCitationSlot,
} from "./citations";
import { loadChunks, loadNamedDocumentChunks, loadNamedParseSummaries, mergeChunkRows } from "./chat-data";
import { buildLlmMessages, getConversationMemorySummary, splitHistoryForMemory } from "./chat-memory";
import {
  shouldForceExternalSearch,
  skillIntentSystemLines,
  websitePlatformIdentityLines,
  type SkillIntent,
} from "./chat-modes";
import {
  extractHttpUrls,
  tavilyCapabilitySystemLines,
  buildTavilyQuery,
  formatTavilyBlock,
  searchTavily,
  wantsExternalSearch,
  wantsLinkedPageFollow,
} from "./tavily-search";
import {
  chunkMatchesNamedFile,
  isGenericProjectQuestion,
  isPlaceholderChunkText,
  selectChunksForChatWithVectors,
  type ChunkRow,
} from "./search";
import { getQueryEmbeddingCached } from "./query-embedding-cache";
import type { EmbedEnv } from "./embeddings";

const FILE_ONLY_USER_PROMPT =
  /已发送\s*\d+\s*个文件|请基于资料继续|请阅读刚上传/u;

const DEEP_EXCERPT_MAX_CHARS = 95_000;
const OVERVIEW_EXCERPT_MAX_CHARS = 36_000;

export const CHAT_STATUS = {
  loading: "正在加载项目资料…",
  retrieving: "正在检索相关片段…",
  external: "正在联网搜索公开资料…",
  generating: "正在生成回答…",
} as const;

export type ChatContextEnv = EmbedEnv & {
  DB: AppDatabase;
  TAVILY_API_KEY?: string;
};

export type PrepareChatContextParams = {
  env: ChatContextEnv;
  projectId: string;
  userId: string;
  conversationId?: string;
  message: string;
  files?: string[];
  fileIds?: string[];
  history: { role: string; content: string }[];
  chatMode: SkillIntent;
  deepMode: boolean;
  overviewQuestion: boolean;
  injectPackageCorpus: boolean;
  dbProjectSummary: string;
  projectTitleHint: string;
  hermesConfigured: boolean;
  tavilyConfigured: boolean;
  onStatus?: (label: string) => void;
};

export type PrepareChatContextResult = {
  messages: { role: string; content: string }[];
  streamMeta: Record<string, unknown>;
  usedExternalSearch: boolean;
  hadPackageChunks: boolean;
};

function buildExcerptFromHits(
  hits: ChunkRow[],
  slots: ReturnType<typeof getCitationSlots>,
  usedSlotIds: Set<string>,
  dbProjectSummary: string,
): string {
  if (hits.length === 0) {
    return dbProjectSummary
      ? `${dbProjectSummary}（资料包暂无可用正文摘录；请结合上方项目登记信息作答，并说明需用户补充材料处。）`
      : "（未检索到资料摘录；请明确说明依据不足，勿编造。）";
  }

  const onlyPlaceholders = hits.every((h) => isPlaceholderChunkText(h.text));
  if (onlyPlaceholders) {
    return "（资料文件已上传，但正文未解析成功，多为扫描版 PDF。请改传可复制文字的 PDF 或 .txt/.md，或重新上传后重试。）";
  }

  let excerptBlock = hits
    .map((h) => {
      const slot = matchCitationSlot(slots, h.filename ?? "");
      if (slot) usedSlotIds.add(slot.id);
      const slotHint = slot ? `[ID:${slot.id}]` : "";
      const scopeHint = h.scope === "session" ? "（本对话附件）" : "";
      return `${slotHint} 文件：${h.filename ?? "资料"}${scopeHint}\n${h.text}`;
    })
    .join("\n\n---\n\n");

  if (dbProjectSummary && !excerptBlock.startsWith("【项目登记")) {
    excerptBlock = `${dbProjectSummary}${excerptBlock}`;
  }
  return excerptBlock;
}

function formatNamedSummaryFallback(
  summaries: Awaited<ReturnType<typeof loadNamedParseSummaries>>,
): string {
  if (summaries.length === 0) return "";
  return summaries
    .map((s) => {
      const points =
        s.keyPoints.length > 0
          ? `\n要点：\n${s.keyPoints.map((p) => `- ${p}`).join("\n")}`
          : "";
      return `文件：${s.filename}\n（源文件已解析摘要）\n${s.summary}${points}`;
    })
    .join("\n\n---\n\n");
}

export async function prepareStandardChatContext(
  params: PrepareChatContextParams,
): Promise<PrepareChatContextResult> {
  const {
    env,
    projectId,
    userId,
    message,
    history,
    chatMode,
    deepMode,
    overviewQuestion,
    injectPackageCorpus,
    dbProjectSummary,
    projectTitleHint,
    hermesConfigured,
    tavilyConfigured,
    onStatus,
  } = params;

  const conversationKey = (params.conversationId ?? "").trim();
  const slots = getCitationSlots(projectId);
  const citationMap = citationMapFromSlots(slots);
  const usedSlotIds = new Set<string>();

  const fileHint = (params.files ?? []).join(" ");
  const prioritizeFilenames = (params.files ?? []).filter(Boolean);
  const prioritizeDocumentIds = (params.fileIds ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean);
  const namedFileTurn = prioritizeFilenames.length > 0 || prioritizeDocumentIds.length > 0;
  const searchQuery = fileHint ? `${message} ${fileHint}` : message;
  const willUseVectors =
    !injectPackageCorpus && Boolean((env.DASHSCOPE_API_KEY || "").trim());

  onStatus?.(CHAT_STATUS.loading);

  const tavilyKey = (env.TAVILY_API_KEY || "").trim();
  const historyForQuery = history.filter((m) => m.role === "user" || m.role === "assistant");

  const [poolChunks, namedChunks, memorySummary, queryEmbedding] = await Promise.all([
    loadChunks(env, projectId, userId, params.conversationId),
    namedFileTurn
      ? loadNamedDocumentChunks(
          env,
          projectId,
          userId,
          params.conversationId,
          prioritizeDocumentIds,
          prioritizeFilenames,
        )
      : Promise.resolve([] as ChunkRow[]),
    getConversationMemorySummary(env, userId, conversationKey),
    willUseVectors
      ? getQueryEmbeddingCached(env, projectId, searchQuery)
      : Promise.resolve(null as number[] | null),
  ]);

  const allChunks = mergeChunkRows(poolChunks, namedChunks);
  const namedUsable = namedChunks.filter(
    (c) => !isPlaceholderChunkText(c.text) && c.text.trim().length > 0,
  );
  let namedSummaries: Awaited<ReturnType<typeof loadNamedParseSummaries>> = [];
  if (namedFileTurn && namedUsable.length === 0) {
    namedSummaries = await loadNamedParseSummaries(
      env,
      projectId,
      userId,
      params.conversationId,
      prioritizeDocumentIds,
      prioritizeFilenames,
    );
  }

  const namedTextBlob = [
    ...namedUsable.map((c) => c.text),
    ...namedSummaries.map((s) => `${s.summary}\n${s.keyPoints.join("\n")}`),
  ].join("\n");
  const fileUrls = extractHttpUrls(namedTextBlob);
  const followLinks = wantsLinkedPageFollow(message);
  const needsExternal =
    wantsExternalSearch(message) ||
    shouldForceExternalSearch(chatMode) ||
    (followLinks && (fileUrls.length > 0 || tavilyConfigured));

  let externalResult: { used: boolean; block: string } = { used: false, block: "" };
  if (needsExternal) {
    onStatus?.(CHAT_STATUS.external);
    if (!tavilyKey) {
      externalResult = {
        used: true,
        block: formatTavilyBlock(
          [],
          "未配置 TAVILY_API_KEY（请在 API 环境变量中设置 TAVILY_API_KEY）",
        ),
      };
    } else if (fileUrls.length > 0) {
      const urlSlice = fileUrls.slice(0, 3);
      const searches = await Promise.all(
        urlSlice.map((url) => searchTavily(tavilyKey, url, 3)),
      );
      const blocks = searches.map((res, i) => {
        const label = `文件内链接 ${i + 1}：${urlSlice[i]}`;
        return `${label}\n${formatTavilyBlock(res.hits, res.error)}`;
      });
      externalResult = { used: true, block: blocks.join("\n\n---\n\n") };
    } else {
      const tavilyQuery = buildTavilyQuery(message, fileHint, historyForQuery);
      const { hits, error } = await searchTavily(tavilyKey, tavilyQuery);
      externalResult = { used: true, block: formatTavilyBlock(hits, error) };
    }
  }

  const hadPackageChunks = allChunks.length > 0;
  onStatus?.(CHAT_STATUS.retrieving);

  const namedMaxChars = namedFileTurn ? 48_000 : 8_000;
  const selectOptions = {
    deep: injectPackageCorpus || namedFileTurn,
    maxChars: injectPackageCorpus
      ? overviewQuestion && !deepMode
        ? OVERVIEW_EXCERPT_MAX_CHARS
        : DEEP_EXCERPT_MAX_CHARS
      : namedMaxChars,
    topK: overviewQuestion ? 24 : namedFileTurn ? 12 : 5,
    prioritizeFilenames,
    prioritizeDocumentIds,
  };

  let hits = await selectChunksForChatWithVectors(
    env,
    allChunks,
    searchQuery,
    selectOptions,
    queryEmbedding,
  );

  if (
    hits.length === 0 &&
    allChunks.length > 0 &&
    (FILE_ONLY_USER_PROMPT.test(message) || overviewQuestion || namedFileTurn)
  ) {
    hits = await selectChunksForChatWithVectors(
      env,
      allChunks,
      searchQuery,
      {
        deep: true,
        maxChars: OVERVIEW_EXCERPT_MAX_CHARS,
        topK: 24,
        prioritizeFilenames,
        prioritizeDocumentIds,
      },
      queryEmbedding,
    );
  }

  if (namedFileTurn) {
    const namedHits = allChunks.filter((c) =>
      chunkMatchesNamedFile(c, {
        ids: prioritizeDocumentIds,
        filenames: prioritizeFilenames,
      }),
    );
    const usableNamed = namedHits.filter((c) => !isPlaceholderChunkText(c.text));
    const selectedIds = new Set(hits.map((h) => h.id));
    const prepend: ChunkRow[] = [];
    for (const c of usableNamed.sort((a, b) => a.chunk_index - b.chunk_index)) {
      if (!selectedIds.has(c.id)) {
        prepend.push(c);
        selectedIds.add(c.id);
      }
    }
    if (prepend.length > 0) hits = [...prepend, ...hits];
  }

  let excerptBlock = buildExcerptFromHits(hits, slots, usedSlotIds, dbProjectSummary);
  const summaryFallback = formatNamedSummaryFallback(namedSummaries);
  if (summaryFallback) {
    excerptBlock = excerptBlock
      ? `${summaryFallback}\n\n---\n\n${excerptBlock}`
      : `${dbProjectSummary}${summaryFallback}`;
  }
  if (
    hits.length === 0 &&
    !summaryFallback &&
    dbProjectSummary &&
    !excerptBlock.startsWith("【项目登记")
  ) {
    excerptBlock = dbProjectSummary;
  }

  const usedExternalSearch = externalResult.used;
  const externalBlock = externalResult.block;

  const activeSlots =
    usedSlotIds.size > 0 ? slots.filter((s) => usedSlotIds.has(s.id)) : slots;
  const citationLines = buildCitationSystemLines(activeSlots);
  const { recent } = splitHistoryForMemory(history);

  const namedFilePrompt = namedFileTurn
    ? "用户本轮点名或附上了项目源文件（不一定是本对话新上传）。【资料摘录】中对应文件的正文或已解析摘要视为已经读到：必须据此作答，禁止声称无法访问、无法读取、文件不在资料包中或需要用户重传。若摘录含 URL，先列出链接；若有【外部检索】再整理网页要点。"
    : "若【资料摘录】或【项目登记信息】中已有本项目资料包内容，必须基于其介绍项目背景与要点；禁止声称「没有看到任何项目资料」。";

  const systemParts = [
    ...websitePlatformIdentityLines(),
    "你是联合家办平台项目助手，服务机会型投资尽调场景。回答须综合三类依据：（1）【资料摘录】中的项目内事实；（2）若有【外部检索】则纳入公开网页信息；（3）为衔接上下文的行业/流程推论——须标明「推论」或「待核实」，不得冒充已核实事实。",
    "你不是「只能读上传 PDF」的机器人：项目内问题以摘录为主；公开信息、政策、市场动态在触发联网或摘录不足时，应结合外部检索或明确说明缺口与下一步（如建议用户说「查外部资料：…」）。",
    "用户可能使用项目简称；与摘录中明显同一项目时，应正常作答，勿因简称不同而拒绝。",
    ...(overviewQuestion || hadPackageChunks || namedFileTurn ? [namedFilePrompt] : []),
    "引用规范：上传资料用 [ID:n]（仅可引用摘录中实际出现且下列存在的编号）；网页用 [WEB:n] 并附 URL；勿混用。",
    ...(chatMode === "standard"
      ? [
          hermesConfigured
            ? "轻问快答：主要依据下方【资料摘录】与对话上下文作答；若用户明确提出尽调清单、知识网络、IC 备忘录等深度交付，说明将转入后台深度分析（勿自称无法完成）。"
            : "若用户需要全面分析、尽调清单、风险矩阵、回报测算、知识网络或 IC 备忘录，在本对话直接说明即可；平台会注入更完整资料摘录并输出结构化结果。",
        ]
      : skillIntentSystemLines(chatMode, projectTitleHint)),
    ...tavilyCapabilitySystemLines(tavilyConfigured),
    "可用引用编号与文献名：",
    citationLines,
    "",
    "【资料摘录】",
    excerptBlock,
  ];

  if (usedExternalSearch) {
    systemParts.push(
      "",
      "【外部检索（Tavily）】",
      externalBlock,
      "",
      "【本轮指令】用户需要公开信息。以【外部检索】为主、与【资料摘录】交叉验证：一致处可加强信心，冲突处分别列出并建议待核项；勿否认本轮已具备的联网结果。",
    );
  }

  const messages = buildLlmMessages({
    systemParts,
    memorySummary,
    recentHistory: recent,
    userMessage: message,
  });

  return {
    messages,
    streamMeta: {
      citationMap,
      projectId,
      externalSearch: usedExternalSearch,
      chatMode,
      skillIntent: chatMode,
    },
    usedExternalSearch,
    hadPackageChunks,
  };
}

export { isGenericProjectQuestion } from "./search";
