import type { AppDatabase } from "./app-database";
import {
  buildCitationSystemLines,
  citationMapFromSlots,
  getCitationSlots,
  matchCitationSlot,
} from "./citations";
import { loadChunks, loadNamedDocumentChunks, loadNamedParseSummaries, loadProjectParseSummaries, mergeChunkRows } from "./chat-data";
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
import { buildCitedChapterExcerpt } from "./knowledge-network-chapter-cite";
import { formatProjectKnowledgeState } from "./project-knowledge-state";

const FILE_ONLY_USER_PROMPT =
  /已发送\s*\d+\s*个文件|请基于资料继续|请阅读刚上传/u;

const DEEP_EXCERPT_MAX_CHARS = 95_000;
const OVERVIEW_EXCERPT_MAX_CHARS = 36_000;

export const CHAT_STATUS = {
  loading: "正在载入项目知识…",
  retrieving: "正在载入项目知识…",
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
    return dbProjectSummary.trim();
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

  const [poolChunks, namedChunks, projectSummaries, memorySummary, queryEmbedding] = await Promise.all([
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
    loadProjectParseSummaries(env, projectId, userId, params.conversationId),
    getConversationMemorySummary(env, userId, conversationKey),
    willUseVectors
      ? getQueryEmbeddingCached(env, projectId, searchQuery)
      : Promise.resolve(null as number[] | null),
  ]);

  const allChunks = mergeChunkRows(poolChunks, namedChunks);
  const namedUsable = namedChunks.filter(
    (c) => !isPlaceholderChunkText(c.text) && c.text.trim().length > 0,
  );
  const prioritizeDocumentIdsResolved = namedFileTurn
    ? [
        ...new Set([
          ...prioritizeDocumentIds,
          ...namedChunks.map((c) => c.document_id).filter(Boolean),
        ]),
      ]
    : prioritizeDocumentIds;
  let namedSummaries: Awaited<ReturnType<typeof loadNamedParseSummaries>> = [];
  if (namedFileTurn && namedUsable.length === 0) {
    namedSummaries = await loadNamedParseSummaries(
      env,
      projectId,
      userId,
      params.conversationId,
      prioritizeDocumentIdsResolved,
      prioritizeFilenames,
    );
  }
  const knowledgeSummaries = [
    ...projectSummaries,
    ...namedSummaries.filter(
      (s) => !projectSummaries.some((p) => p.documentId === s.documentId),
    ),
  ];

  const namedTextBlob = [
    ...namedUsable.map((c) => c.text),
    ...namedSummaries.map((s) => `${s.summary}\n${s.keyPoints.join("\n")}`),
  ].join("\n");
  const fileUrls = extractHttpUrls(namedTextBlob);
  const followLinks = wantsLinkedPageFollow(message);
  const needsExternal =
    !hermesConfigured &&
    (wantsExternalSearch(message) ||
      shouldForceExternalSearch(chatMode) ||
      (followLinks && (fileUrls.length > 0 || tavilyConfigured)));

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
    prioritizeDocumentIds: prioritizeDocumentIdsResolved,
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
        prioritizeDocumentIds: prioritizeDocumentIdsResolved,
      },
      queryEmbedding,
    );
  }

  if (namedFileTurn) {
    const namedHits = allChunks.filter((c) =>
      chunkMatchesNamedFile(c, {
        ids: prioritizeDocumentIdsResolved,
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

  const knowledgeBlock = formatProjectKnowledgeState(
    knowledgeSummaries,
    dbProjectSummary,
  );
  let excerptBlock = buildExcerptFromHits(hits, slots, usedSlotIds, "");
  const summaryFallback = formatNamedSummaryFallback(namedSummaries);
  if (summaryFallback && !knowledgeSummaries.length) {
    excerptBlock = excerptBlock
      ? `${summaryFallback}\n\n---\n\n${excerptBlock}`
      : summaryFallback;
  }

  let citedChapterExcerpt: string | null = null;
  try {
    citedChapterExcerpt = await buildCitedChapterExcerpt(
      env.DB,
      projectId,
      message,
    );
  } catch {
    citedChapterExcerpt = null;
  }
  if (citedChapterExcerpt) {
    excerptBlock = excerptBlock
      ? `${citedChapterExcerpt}\n\n---\n\n${excerptBlock}`
      : citedChapterExcerpt;
  }

  const usedExternalSearch = externalResult.used;
  const externalBlock = externalResult.block;

  const activeSlots =
    usedSlotIds.size > 0 ? slots.filter((s) => usedSlotIds.has(s.id)) : slots;
  const citationLines = buildCitationSystemLines(activeSlots);
  const { recent } = splitHistoryForMemory(history);

  const hasProjectKnowledge =
    knowledgeBlock.length > 0 ||
    hits.length > 0 ||
    Boolean(citedChapterExcerpt) ||
    namedFileTurn ||
    hadPackageChunks;

  const namedFilePrompt = namedFileTurn
    ? "用户本轮点名或附上了项目源文件。【项目知识】与【原文】里对应文件视为本项目已经掌握的内容：必须据此作答，禁止声称无法访问、无法读取、文件不在资料包中或需要用户重传。若含 URL，先列出链接；若有【外部检索】再整理网页要点。"
    : citedChapterExcerpt
      ? "用户本轮引用了项目知识网络的某一章。【原文】开头的【知识网络章节】视为已经掌握：须优先据此作答，并说明依据来自该章；不要声称看不到知识网络。"
      : "你处在本项目里回答。【项目知识】是上传并解析后已经进入本项目的内容，不是本轮临时去搜的流程。所有问答都基于这些知识。细节以【原文】为准。知识里没有的标明缺口，不要编造。";

  const systemParts = [
    ...websitePlatformIdentityLines(),
    "你是联合家办平台项目助手。回答须综合：（1）本项目已经掌握的知识；（2）若有【外部检索】则纳入公开网页；（3）行业/流程推论须标明「推论」或「待核实」。",
    "用户可能使用项目简称；与项目知识中明显同一项目时，应正常作答，勿因简称不同而拒绝。",
    ...(hasProjectKnowledge ? [namedFilePrompt] : []),
    "引用规范：上传资料用 [ID:n]（仅可引用原文中实际出现且下列存在的编号）；网页用 [WEB:n] 并附 URL；勿混用。",
    ...(chatMode === "standard"
      ? [
          hermesConfigured
            ? "由 Hermes 接的对话模型直接作答。用户明确要尽调清单、知识网络、IC 备忘录等需要动手的交付时，说明将转入后台任务（勿自称无法完成）。"
            : "若用户需要全面分析、尽调清单、风险矩阵、回报测算、知识网络或 IC 备忘录，在本对话直接说明即可。",
        ]
      : skillIntentSystemLines(chatMode, projectTitleHint)),
    ...tavilyCapabilitySystemLines(tavilyConfigured),
    "可用引用编号与文献名：",
    citationLines,
    "",
    "【项目知识】",
    knowledgeBlock ||
      (hadPackageChunks
        ? "资料已上传。下面【原文】是本项目知识中的相关段落。"
        : "本项目还没有可用的解析知识；不要编造项目事实。"),
  ];

  if (excerptBlock.trim()) {
    systemParts.push("", "【原文】", excerptBlock);
  }

  if (usedExternalSearch) {
    systemParts.push(
      "",
      "【外部检索（Tavily）】",
      externalBlock,
      "",
      "【本轮指令】用户需要公开信息。以【外部检索】为主、与【项目知识】/【原文】交叉验证：一致处可加强信心，冲突处分别列出并建议待核项；勿否认本轮已具备的联网结果。",
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
