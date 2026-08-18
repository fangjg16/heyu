import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collabStatusLabel,
  fetchCollabBoard,
  fetchProjectKnowledgeChapter,
  PROJECT_UPLOAD_FOLDER,
  publishCollabItem,
  publishOpenQuestionToIssuer,
  reviewCollabItem,
  uploadProjectPackageFile,
  type CollabIssuerAccount,
  type CollabItem,
  type CollabPriority,
} from "@/lib/project-api";
import {
  inferQuestionKind,
  parseOpenQuestionsFromHtml,
  type QuestionKind,
} from "@/lib/open-questions-parse";
import {
  extractOpenQuestionTitle,
  formatOpenQuestionForIssuer,
  previewCollabQuestion,
  stripCitationMarkers,
} from "@/lib/kn-citations";
import { getMergedProjects } from "@/workspace/project-registry";
import { canPublishToIssuer, getProjectRole } from "@/workspace/workspace-users";
import { cn } from "@/lib/utils";

type InvestorCollabSectionProps = {
  projectId: string;
  userId: string;
};

type CollabTab = "unsent" | "pending" | "replied";
type KindFilter = "all" | QuestionKind;

const KIND_OPTIONS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "问题类型" },
  { id: "business", label: "业务" },
  { id: "tech", label: "技术" },
  { id: "finance", label: "财务" },
  { id: "other", label: "其他" },
];

function defaultAssignedTo(list: CollabIssuerAccount[]) {
  return list.length === 1 ? list[0].userId : "";
}

export function InvestorCollabSection({
  projectId,
  userId,
}: InvestorCollabSectionProps) {
  const [items, setItems] = useState<CollabItem[]>([]);
  const [issuers, setIssuers] = useState<CollabIssuerAccount[]>([]);
  const [questions, setQuestions] = useState<{ text: string; priority: CollabPriority }[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const project = getMergedProjects().find((p) => p.id === projectId);
  const role = getProjectRole(userId, projectId, project?.createdBy);
  const canManage = canPublishToIssuer(role);

  const [tab, setTab] = useState<CollabTab>("unsent");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const [sourceText, setSourceText] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState<CollabPriority>("P2");
  const [dueAt, setDueAt] = useState("");
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [incomingDraft, setIncomingDraft] = useState<{
    sourceText: string;
    title?: string;
    priority?: CollabPriority;
  } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`hy-collab-publish-draft:${projectId}`);
      if (!raw) return;
      sessionStorage.removeItem(`hy-collab-publish-draft:${projectId}`);
      const parsed = JSON.parse(raw) as {
        sourceText?: string;
        title?: string;
        priority?: CollabPriority;
      };
      if (parsed.sourceText?.trim()) {
        setIncomingDraft({
          sourceText: parsed.sourceText,
          title: parsed.title,
          priority: parsed.priority,
        });
      }
    } catch {
      /* ignore */
    }
  }, [projectId]);

  const load = useCallback(async () => {
    const [board, ch] = await Promise.all([
      fetchCollabBoard(projectId),
      fetchProjectKnowledgeChapter(projectId, "questions", userId).catch(
        () => null,
      ),
    ]);
    setItems(board.items);
    setIssuers(board.issuers);
    if (ch?.html) {
      setQuestions(
        parseOpenQuestionsFromHtml(ch.html).map((q) => ({
          text: q.text,
          priority: q.priority,
        })),
      );
    }
  }, [projectId, userId]);

  useEffect(() => {
    if (!incomingDraft) return;
    const t = incomingDraft.sourceText;
    const q = questions.find((x) => x.text === t);
    setTab("unsent");
    setComposing(false);
    setEditingKey(t);
    setSourceText(t);
    const formatted = formatOpenQuestionForIssuer(t);
    setTitle(incomingDraft.title || formatted.title);
    setBody(formatted.body);
    setPriority(q?.priority ?? incomingDraft.priority ?? "P2");
    setAssignedTo(defaultAssignedTo(issuers));
  }, [incomingDraft, questions, issuers]);

  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "加载失败"),
    );
  }, [load]);

  useEffect(() => {
    setAssignedTo((prev) => prev || defaultAssignedTo(issuers));
  }, [issuers]);

  const unpublishedQuestions = questions.filter(
    (q) => !items.some((it) => it.sourceQuestionText === q.text),
  );

  const matchKind = (text: string) =>
    kindFilter === "all" || inferQuestionKind(text) === kindFilter;

  const unsentList = unpublishedQuestions.filter((q) => matchKind(q.text));
  const pendingList = items.filter(
    (it) =>
      (it.status === "pending_reply" ||
        it.status === "saved" ||
        it.status === "needs_more") &&
      matchKind(it.sourceQuestionText || it.title),
  );
  const repliedList = items.filter(
    (it) =>
      (it.status === "submitted" || it.status === "confirmed") &&
      matchKind(it.sourceQuestionText || it.title),
  );

  const tabs = useMemo(
    () =>
      [
        { id: "unsent" as const, label: "未发送", count: unsentList.length },
        { id: "pending" as const, label: "待回复", count: pendingList.length },
        { id: "replied" as const, label: "已回复", count: repliedList.length },
      ] as const,
    [unsentList.length, pendingList.length, repliedList.length],
  );

  const resetCompose = () => {
    setTitle("");
    setBody("");
    setSourceText("");
    setAttachFiles([]);
    setFileInputKey((k) => k + 1);
    setDueAt("");
    setAssignedTo(defaultAssignedTo(issuers));
    setPriority("P2");
    setEditingKey(null);
    setComposing(false);
  };

  const openEdit = (q: { text: string; priority: CollabPriority }) => {
    if (editingKey === q.text) {
      setEditingKey(null);
      return;
    }
    setComposing(false);
    setEditingKey(q.text);
    setSourceText(q.text);
    const formatted = formatOpenQuestionForIssuer(q.text);
    setTitle(formatted.title);
    setBody(formatted.body);
    setPriority(q.priority);
    setAssignedTo(defaultAssignedTo(issuers));
    setDueAt("");
    setAttachFiles([]);
    setFileInputKey((k) => k + 1);
  };

  const openCompose = () => {
    setTab("unsent");
    setEditingKey(null);
    setSourceText("");
    setTitle("");
    setBody("");
    setPriority("P2");
    setAssignedTo(defaultAssignedTo(issuers));
    setDueAt("");
    setAttachFiles([]);
    setFileInputKey((k) => k + 1);
    setComposing(true);
  };

  const onSendQuestion = async (q: { text: string; priority: CollabPriority }) => {
    if (!canManage) {
      setError("仅 Admin / Core 可发给项目协作方");
      return;
    }
    setBusy(q.text);
    setError(null);
    try {
      await publishOpenQuestionToIssuer(projectId, {
        text: q.text,
        title: q.text.slice(0, 80),
        priority: q.priority,
      });
      if (editingKey === q.text) resetCompose();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setBusy(null);
    }
  };

  const onSendAllUnpublished = async () => {
    if (!canManage) {
      setError("仅 Admin / Core 可发给项目协作方");
      return;
    }
    if (unsentList.length === 0) return;
    setBusy("publish-all");
    setError(null);
    try {
      for (const q of unsentList) {
        await publishOpenQuestionToIssuer(projectId, {
          text: q.text,
          title: q.text.slice(0, 80),
          priority: q.priority,
        });
      }
      resetCompose();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setBusy(null);
    }
  };

  const onPublish = async () => {
    if (!canManage) {
      setError("仅 Admin / Core 可发给项目协作方");
      return;
    }
    if (issuers.length > 0 && !assignedTo) {
      setError("请选择发送账号");
      return;
    }
    setBusy("publish");
    setError(null);
    try {
      const item = await publishCollabItem(projectId, {
        title:
          stripCitationMarkers(title.trim() || sourceText).slice(0, 80) ||
          formatOpenQuestionForIssuer(sourceText).title,
        body:
          stripCitationMarkers(body.trim() || sourceText) ||
          formatOpenQuestionForIssuer(sourceText).body,
        sourceQuestionText: sourceText,
        replyMode: "both",
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        assignedTo: assignedTo || null,
      });
      for (const file of attachFiles) {
        await uploadProjectPackageFile(projectId, userId, file, {
          relativePath: PROJECT_UPLOAD_FOLDER,
          collabItemId: item.id,
          sourceKind: "investor_share",
        });
      }
      resetCompose();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setBusy(null);
    }
  };

  const onReview = async (id: string, action: "confirm" | "reject") => {
    setBusy(id);
    setError(null);
    try {
      await reviewCollabItem(projectId, id, {
        action,
        reviewNote: reviewNotes[id]?.trim() || undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "审核失败");
    } finally {
      setBusy(null);
    }
  };

  const wordingForm = (
    <div className="mt-3 space-y-2 rounded-xl border border-[rgba(78,66,57,0.08)] bg-[rgba(248,243,238,0.55)] px-3 py-3">
      <input
        className="h-9 w-full rounded-lg border border-[rgba(78,66,57,0.12)] bg-white px-2 text-[13px]"
        placeholder="对外中性标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full rounded-lg border border-[rgba(78,66,57,0.12)] bg-white px-2 py-2 text-[13px]"
        rows={4}
        placeholder="需确认的具体内容"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <select
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] bg-white px-2 text-[13px]"
        >
          {issuers.length === 0 ? (
            <option value="">暂无协作方账号</option>
          ) : (
            <>
              {issuers.length > 1 ? (
                <option value="">选择发送账号</option>
              ) : null}
              {issuers.map((acc) => (
                <option key={acc.userId} value={acc.userId}>
                  {acc.displayName}
                </option>
              ))}
            </>
          )}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as CollabPriority)}
          className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] bg-white px-2 text-[13px]"
        >
          <option value="P1">P1 紧急</option>
          <option value="P2">P2 重要</option>
          <option value="P3">P3 跟进</option>
        </select>
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] bg-white px-2 text-[13px]"
        />
      </div>
      <label className="flex h-9 items-center gap-2 rounded-lg border border-[rgba(78,66,57,0.12)] bg-white px-2 text-[13px] text-[#59625F]">
        <span className="shrink-0">增加附件</span>
        <input
          key={fileInputKey}
          type="file"
          multiple
          className="min-w-0 flex-1 text-[12.5px] file:mr-2 file:rounded file:border-0 file:bg-transparent file:text-[12.5px]"
          onChange={(e) =>
            setAttachFiles(Array.from(e.target.files ?? []))
          }
        />
      </label>
      <button
        type="button"
        disabled={
          Boolean(busy) ||
          !(body.trim() || sourceText.trim()) ||
          (issuers.length > 0 && !assignedTo)
        }
        onClick={() => void onPublish()}
        className="inline-flex h-9 items-center justify-center rounded-lg bg-[#A06358] px-3 text-[12.5px] font-medium leading-none text-white disabled:opacity-45"
      >
        {busy === "publish" ? "发送中…" : "发送"}
      </button>
    </div>
  );

  const renderPublished = (list: CollabItem[]) =>
    list.length === 0 ? (
      <p className="mt-4 text-[13px] text-[#969E9A]">暂无事项。</p>
    ) : (
      <ul className="mt-4 space-y-3">
        {list.map((it) => {
          const preview = previewCollabQuestion(it);
          return (
            <li
              key={it.id}
              className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/80 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[#1F2423]">{preview.title}</div>
                  {preview.detail ? (
                    <div className="mt-1 text-[12.5px] text-[#59625F] line-clamp-2">
                      {preview.detail}
                    </div>
                  ) : null}
                </div>
                <span className="shrink-0 text-[11.5px] text-[#A06358]">
                  {collabStatusLabel(it.status)}
                </span>
              </div>
              {it.replyText ? (
                <p className="mt-2 text-[13px] leading-relaxed text-[#1F2423]">
                  项目协作方答复：{it.replyText}
                </p>
              ) : null}
              {canManage && it.status === "submitted" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={reviewNotes[it.id] ?? ""}
                    onChange={(e) =>
                      setReviewNotes((m) => ({ ...m, [it.id]: e.target.value }))
                    }
                    placeholder="退回说明（可选）"
                    className="h-9 min-w-[180px] flex-1 rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[12.5px]"
                  />
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void onReview(it.id, "confirm")}
                    className="h-9 rounded-lg bg-[#5E9B75] px-3 text-[12.5px] text-white"
                  >
                    确认并回写
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void onReview(it.id, "reject")}
                    className="h-9 rounded-lg border border-[rgba(160,99,88,0.3)] px-3 text-[12.5px] text-[#A06358]"
                  >
                    退回需补充
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8 md:px-10">
      <h2 className="text-[20px] font-semibold text-[#1F2423]">项目协作</h2>
      {error ? (
        <p className="mt-3 text-[13px] text-[#A06358]">{error}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex h-9 items-center rounded-[10px] bg-[rgba(78,66,57,0.06)] p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "h-8 rounded-md px-3 text-[12.5px] leading-none",
                tab === t.id
                  ? "bg-white font-medium text-[#A06358] shadow-[0_1px_2px_rgba(78,66,57,0.08)]"
                  : "text-[#59625F]",
              )}
            >
              {t.label}
              {t.count > 0 ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as KindFilter)}
          className="h-9 rounded-[10px] border border-[rgba(78,66,57,0.14)] bg-white px-2.5 text-[12.5px] text-[#59625F]"
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex h-9 items-center gap-2">
          {canManage ? (
            <button
              type="button"
              onClick={openCompose}
              className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[rgba(78,66,57,0.18)] bg-transparent px-3.5 text-[12.5px] font-medium text-[#1F2423]"
            >
              新增
            </button>
          ) : null}
          {canManage && tab === "unsent" && unsentList.length > 0 ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void onSendAllUnpublished()}
              className="inline-flex h-9 items-center justify-center rounded-[10px] bg-[#A06358] px-3.5 text-[12.5px] font-medium leading-none text-white disabled:opacity-45"
            >
              {busy === "publish-all" ? "发送中…" : "一键发送"}
            </button>
          ) : null}
        </div>
      </div>

      {tab === "unsent" ? (
        <div className="mt-4">
          {canManage && composing ? wordingForm : null}
          {unsentList.length === 0 && !composing ? (
            <p className="mt-4 text-[13px] text-[#969E9A]">暂无未发事项。</p>
          ) : (
            <ul className="space-y-2">
              {unsentList.map((q) => {
                const preview = extractOpenQuestionTitle(q.text);
                const expanded = editingKey === q.text;
                return (
                  <li
                    key={q.text}
                    className="rounded-xl border border-[rgba(78,66,57,0.08)] bg-white/80 px-4 py-3"
                  >
                    <div className="flex items-center gap-4">
                      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-[#1F2423]">
                        <span className="mr-1.5 text-[11px] text-[#A06358]">
                          {q.priority}
                        </span>
                        {preview.title}
                        {preview.detail ? (
                          <div className="mt-1 text-[12px] text-[#59625F] line-clamp-2">
                            {preview.detail}
                          </div>
                        ) : null}
                      </div>
                      {canManage ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-[rgba(78,66,57,0.16)] bg-transparent px-3 text-[12.5px] font-medium text-[#59625F] hover:bg-[rgba(78,66,57,0.04)]"
                            onClick={() => openEdit(q)}
                          >
                            {expanded ? "收起" : "编辑"}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => void onSendQuestion(q)}
                            className="inline-flex h-8 items-center justify-center rounded-lg bg-[#A06358] px-3 text-[12.5px] font-medium text-white disabled:opacity-45"
                          >
                            {busy === q.text ? "发送中…" : "发送"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {expanded ? wordingForm : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "pending" ? renderPublished(pendingList) : null}
      {tab === "replied" ? renderPublished(repliedList) : null}
    </div>
  );
}
