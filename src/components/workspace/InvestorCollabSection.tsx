import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  collabStatusLabel,
  fetchCollabBoard,
  fetchProjectKnowledgeChapter,
  PROJECT_UPLOAD_FOLDER,
  publishCollabItem,
  publishOpenQuestionToIssuer,
  patchCollabItem,
  reviewCollabItem,
  suggestCollabFollowUp,
  uploadProjectPackageFile,
  type CollabFollowUpSuggest,
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

type UnsentEntry = {
  key: string;
  text: string;
  priority: CollabPriority;
  draft?: CollabItem;
};

function dueInputValue(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10) : "";
}

function defaultAssignedTo(list: CollabIssuerAccount[]) {
  return list.length === 1 ? list[0].userId : "";
}

function hasCollaboratorReply(it: CollabItem): boolean {
  if (it.replyText?.trim()) return true;
  return (
    it.status === "submitted" ||
    it.status === "confirmed" ||
    it.status === "needs_more"
  );
}

function canReviseSent(it: CollabItem): boolean {
  return (
    it.status === "pending_reply" ||
    it.status === "saved" ||
    it.status === "needs_more"
  );
}

const ghostBtnClass =
  "inline-flex h-8 items-center justify-center rounded-lg border border-[rgba(78,66,57,0.16)] bg-transparent px-3 text-[12.5px] font-medium text-[#59625F] hover:bg-[rgba(78,66,57,0.04)] disabled:opacity-45";
const primaryBtnClass =
  "inline-flex h-8 items-center justify-center rounded-lg bg-[#A06358] px-3 text-[12.5px] font-medium text-white disabled:opacity-45";

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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingPublishedId, setEditingPublishedId] = useState<string | null>(
    null,
  );
  const [composing, setComposing] = useState(false);

  const [sourceText, setSourceText] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState<CollabPriority>("P2");
  const [dueAt, setDueAt] = useState("");
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [followUpId, setFollowUpId] = useState<string | null>(null);
  const followUpIdRef = useRef<string | null>(null);
  const [followUpSuggests, setFollowUpSuggests] = useState<
    Record<string, CollabFollowUpSuggest>
  >({});
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
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
    setDetailId(null);
    setEditingPublishedId(null);
    setFollowUpId(null);
    setEditingKey(t);
    setSourceText(t);
    const draft = items.find(
      (d) => d.status === "draft" && d.sourceQuestionText === t,
    );
    if (draft) {
      setTitle(incomingDraft.title || draft.title);
      setBody(draft.body);
      setAssignedTo(draft.assignedTo?.trim() || defaultAssignedTo(issuers));
      setDueAt(dueInputValue(draft.dueAt));
    } else {
      const formatted = formatOpenQuestionForIssuer(t);
      setTitle(incomingDraft.title || formatted.title);
      setBody(formatted.body);
      setAssignedTo(defaultAssignedTo(issuers));
      setDueAt("");
    }
    setPriority(q?.priority ?? incomingDraft.priority ?? draft?.priority ?? "P2");
    setIncomingDraft(null);
  }, [incomingDraft, questions, issuers, items]);

  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "加载失败"),
    );
  }, [load]);

  useEffect(() => {
    setAssignedTo((prev) => prev || defaultAssignedTo(issuers));
  }, [issuers]);

  useEffect(() => {
    followUpIdRef.current = followUpId;
  }, [followUpId]);

  const sentItems = items.filter((it) => it.status !== "draft");
  const draftItems = items.filter((it) => it.status === "draft");

  const matchKind = (text: string) =>
    kindFilter === "all" || inferQuestionKind(text) === kindFilter;

  const unsentEntries: UnsentEntry[] = [
    ...questions
      .filter(
        (q) => !sentItems.some((it) => it.sourceQuestionText === q.text),
      )
      .map((q) => ({
        key: q.text,
        text: q.text,
        priority: q.priority,
        draft: draftItems.find((d) => d.sourceQuestionText === q.text),
      })),
    ...draftItems
      .filter(
        (d) => !questions.some((q) => q.text === d.sourceQuestionText),
      )
      .map((d) => ({
        key: `draft:${d.id}`,
        text: d.sourceQuestionText || d.title,
        priority: d.priority,
        draft: d,
      })),
  ].filter(
    (row) =>
      matchKind(row.text) ||
      (row.draft ? matchKind(`${row.draft.title} ${row.draft.body}`) : false),
  );

  const unsentList = unsentEntries;
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
    setDetailId(null);
    setEditingPublishedId(null);
    setComposing(false);
    setFollowUpId(null);
  };

  const fillWording = (entry: UnsentEntry) => {
    setSourceText(entry.text);
    setPriority(entry.priority);
    if (entry.draft) {
      setTitle(entry.draft.title);
      setBody(entry.draft.body);
      setAssignedTo(
        entry.draft.assignedTo?.trim() || defaultAssignedTo(issuers),
      );
      setDueAt(dueInputValue(entry.draft.dueAt));
      return;
    }
    const formatted = formatOpenQuestionForIssuer(entry.text);
    setTitle(formatted.title);
    setBody(formatted.body);
    setAssignedTo(defaultAssignedTo(issuers));
    setDueAt("");
  };

  const openEdit = (entry: UnsentEntry) => {
    if (editingKey === entry.key) {
      setEditingKey(null);
      return;
    }
    setComposing(false);
    setFollowUpId(null);
    setDetailId(null);
    setEditingPublishedId(null);
    setEditingKey(entry.key);
    fillWording(entry);
    setAttachFiles([]);
    setFileInputKey((k) => k + 1);
  };

  const wordingFields = () => ({
    title:
      stripCitationMarkers(title.trim()) ||
      formatOpenQuestionForIssuer(sourceText).title,
    body:
      stripCitationMarkers(body.trim()) ||
      formatOpenQuestionForIssuer(sourceText).body,
    sourceQuestionText: sourceText,
    replyMode: "both" as const,
    priority,
    dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    assignedTo: assignedTo || null,
  });

  const uploadAttachments = async (itemId: string) => {
    for (const file of attachFiles) {
      await uploadProjectPackageFile(projectId, userId, file, {
        relativePath: PROJECT_UPLOAD_FOLDER,
        collabItemId: itemId,
        sourceKind: "investor_share",
      });
    }
  };

  const openCompose = () => {
    setTab("unsent");
    setEditingKey(null);
    setDetailId(null);
    setEditingPublishedId(null);
    setFollowUpId(null);
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

  const openFollowUp = async (it: CollabItem) => {
    if (followUpId === it.id) {
      setFollowUpId(null);
      return;
    }
    if (!canManage) {
      setError("仅 Admin / Core 可补充问询");
      return;
    }
    setComposing(false);
    setEditingKey(null);
    setDetailId(null);
    setEditingPublishedId(null);
    setFollowUpId(it.id);
    setSourceText(
      `补充问询｜${it.title}${it.replyText ? `\n原答复：${it.replyText}` : ""}`,
    );
    setTitle("");
    setBody("");
    setPriority(it.priority);
    setAssignedTo(it.assignedTo?.trim() || defaultAssignedTo(issuers));
    setDueAt("");
    setAttachFiles([]);
    setFileInputKey((k) => k + 1);
    setError(null);
    const cached = followUpSuggests[it.id];
    if (cached) {
      setTitle(cached.title);
      setBody(cached.body);
      return;
    }
    setSuggestingId(it.id);
    try {
      const s = await suggestCollabFollowUp(projectId, it.id);
      setFollowUpSuggests((m) => ({ ...m, [it.id]: s }));
      if (followUpIdRef.current === it.id) {
        setTitle(s.title);
        setBody(s.body);
      }
    } catch (e) {
      if (followUpIdRef.current === it.id) {
        setError(e instanceof Error ? e.message : "判断失败");
      }
    } finally {
      setSuggestingId((cur) => (cur === it.id ? null : cur));
    }
  };

  const onSendQuestion = async (entry: UnsentEntry) => {
    if (!canManage) {
      setError("仅 Admin / Core 可发给项目协作方");
      return;
    }
    setBusy(entry.key);
    setError(null);
    try {
      if (entry.draft) {
        await patchCollabItem(projectId, entry.draft.id, {
          action: "publish",
          title: entry.draft.title,
          body: entry.draft.body,
          sourceQuestionText: entry.draft.sourceQuestionText || entry.text,
          priority: entry.draft.priority,
          dueAt: entry.draft.dueAt,
          assignedTo: entry.draft.assignedTo,
        });
      } else {
        await publishOpenQuestionToIssuer(projectId, {
          text: entry.text,
          title: extractOpenQuestionTitle(entry.text).title,
          priority: entry.priority,
        });
      }
      if (editingKey === entry.key) resetCompose();
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
      for (const entry of unsentList) {
        if (entry.draft) {
          await patchCollabItem(projectId, entry.draft.id, {
            action: "publish",
            title: entry.draft.title,
            body: entry.draft.body,
            sourceQuestionText: entry.draft.sourceQuestionText || entry.text,
            priority: entry.draft.priority,
            dueAt: entry.draft.dueAt,
            assignedTo: entry.draft.assignedTo,
          });
        } else {
          await publishOpenQuestionToIssuer(projectId, {
            text: entry.text,
            title: extractOpenQuestionTitle(entry.text).title,
            priority: entry.priority,
          });
        }
      }
      resetCompose();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setBusy(null);
    }
  };

  const onSaveDraft = async (existing?: CollabItem) => {
    if (!canManage) {
      setError("仅 Admin / Core 可保存草稿");
      return;
    }
    const fields = wordingFields();
    if (!fields.title || !fields.body) {
      setError("请先填写标题和需确认内容");
      return;
    }
    setBusy("draft");
    setError(null);
    try {
      let item: CollabItem;
      if (existing) {
        item = await patchCollabItem(projectId, existing.id, {
          action: existing.status === "draft" ? "save_draft" : "update",
          ...fields,
        });
      } else {
        item = await publishCollabItem(projectId, {
          ...fields,
          status: "draft",
        });
      }
      await uploadAttachments(item.id);
      resetCompose();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(null);
    }
  };

  const onPublish = async (existing?: CollabItem) => {
    if (!canManage) {
      setError("仅 Admin / Core 可发给项目协作方");
      return;
    }
    if (issuers.length > 0 && !assignedTo) {
      setError("请选择发送账号");
      return;
    }
    const fields = wordingFields();
    setBusy("publish");
    setError(null);
    try {
      let item: CollabItem;
      if (existing?.status === "draft") {
        item = await patchCollabItem(projectId, existing.id, {
          action: "publish",
          ...fields,
        });
      } else if (existing) {
        item = await patchCollabItem(projectId, existing.id, {
          action: "update",
          ...fields,
        });
      } else {
        item = await publishCollabItem(projectId, fields);
      }
      await uploadAttachments(item.id);
      resetCompose();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setBusy(null);
    }
  };

  const onWithdraw = async (it: CollabItem) => {
    if (!canManage) {
      setError("仅 Admin / Core 可撤回");
      return;
    }
    if (
      !window.confirm(
        "撤回后协作方将看不到该事项，并退回「未发送」。确定撤回？",
      )
    ) {
      return;
    }
    setBusy(it.id);
    setError(null);
    try {
      await patchCollabItem(projectId, it.id, { action: "withdraw" });
      resetCompose();
      setTab("unsent");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "撤回失败");
    } finally {
      setBusy(null);
    }
  };

  const fillPublished = (it: CollabItem) => {
    setSourceText(it.sourceQuestionText || it.title);
    setTitle(it.title);
    setBody(it.body);
    setPriority(it.priority);
    setAssignedTo(it.assignedTo?.trim() || defaultAssignedTo(issuers));
    setDueAt(dueInputValue(it.dueAt));
  };

  const openPublishedDetail = (it: CollabItem) => {
    if (detailId === it.id && editingPublishedId !== it.id) {
      setDetailId(null);
      return;
    }
    setComposing(false);
    setEditingKey(null);
    setFollowUpId(null);
    setEditingPublishedId(null);
    setDetailId(it.id);
  };

  const openPublishedEdit = (it: CollabItem) => {
    if (!canManage) {
      setError("仅 Admin / Core 可修改已发事项");
      return;
    }
    if (editingPublishedId === it.id) {
      setEditingPublishedId(null);
      return;
    }
    setComposing(false);
    setEditingKey(null);
    setFollowUpId(null);
    setDetailId(it.id);
    setEditingPublishedId(it.id);
    fillPublished(it);
    setAttachFiles([]);
    setFileInputKey((k) => k + 1);
  };

  const issuerLabel = (id?: string | null) => {
    const uid = id?.trim();
    if (!uid) return "未指定";
    return issuers.find((a) => a.userId === uid)?.displayName ?? uid;
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

  const canSubmitWording =
    Boolean(title.trim() && body.trim()) &&
    !(issuers.length > 0 && !assignedTo);
  const canSaveDraft = Boolean(title.trim() && body.trim());

  const wordingForm = (opts: {
    showSend?: boolean;
    showDraftSave?: boolean;
    existing?: CollabItem;
    sendLabel?: string;
    lead?: ReactNode;
  }) => (
    <div className="mt-3 space-y-2 rounded-xl border border-[rgba(78,66,57,0.08)] bg-[rgba(248,243,238,0.55)] px-3 py-3">
      {opts.lead}
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
      {opts.showDraftSave || opts.showSend ? (
        <div className="flex flex-wrap gap-2">
          {opts.showDraftSave ? (
            <button
              type="button"
              disabled={Boolean(busy) || !canSaveDraft}
              onClick={() => void onSaveDraft(opts.existing)}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[rgba(78,66,57,0.16)] bg-white px-3 text-[12.5px] font-medium text-[#1F2423] disabled:opacity-45"
            >
              {busy === "draft" ? "保存中…" : "保存草稿"}
            </button>
          ) : null}
          {opts.showSend ? (
            <button
              type="button"
              disabled={Boolean(busy) || !canSubmitWording}
              onClick={() => void onPublish(opts.existing)}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-[#A06358] px-3 text-[12.5px] font-medium leading-none text-white disabled:opacity-45"
            >
              {busy === "publish"
                ? "发送中…"
                : opts.sendLabel ?? "发送"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const renderPublished = (list: CollabItem[]) =>
    list.length === 0 ? (
      <p className="mt-4 text-[13px] text-[#969E9A]">暂无事项。</p>
    ) : (
      <ul className="mt-4 space-y-3">
        {list.map((it) => {
          const preview = previewCollabQuestion(it);
          const canFollowUp = canManage && hasCollaboratorReply(it);
          const followUpOpen = canFollowUp && followUpId === it.id;
          const editing = canManage && editingPublishedId === it.id;
          const showingDetail =
            detailId === it.id && !editing && !followUpOpen;
          const suggest = followUpSuggests[it.id];
          const suggesting = suggestingId === it.id;
          const revisable = canManage && canReviseSent(it);
          return (
            <li
              key={it.id}
              className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/80 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => openPublishedDetail(it)}
                >
                  <div className="font-semibold text-[#1F2423]">
                    {canFollowUp ? (
                      <span className="mr-1.5 text-[11px] font-medium text-[#A06358]">
                        {collabStatusLabel(it.status)}
                      </span>
                    ) : null}
                    {preview.title}
                  </div>
                </button>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {!canFollowUp ? (
                    <span className="text-[11.5px] text-[#A06358]">
                      {collabStatusLabel(it.status)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={ghostBtnClass}
                    onClick={() => openPublishedDetail(it)}
                  >
                    {showingDetail ? "收起" : "详情"}
                  </button>
                  {revisable ? (
                    <>
                      <button
                        type="button"
                        className={ghostBtnClass}
                        onClick={() => openPublishedEdit(it)}
                      >
                        {editing ? "收起" : "修改"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        className={ghostBtnClass}
                        onClick={() => void onWithdraw(it)}
                      >
                        {busy === it.id ? "撤回中…" : "撤回"}
                      </button>
                    </>
                  ) : null}
                  {canFollowUp ? (
                    <>
                      <button
                        type="button"
                        className={ghostBtnClass}
                        onClick={() => void openFollowUp(it)}
                      >
                        {followUpOpen ? "收起" : "补充问询"}
                      </button>
                      {followUpOpen ? (
                        <button
                          type="button"
                          disabled={
                            Boolean(busy) ||
                            suggesting ||
                            !canSubmitWording
                          }
                          onClick={() => void onPublish()}
                          className={primaryBtnClass}
                        >
                          {busy === "publish" ? "发送中…" : "发送"}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {editing ? (
                    <button
                      type="button"
                      disabled={Boolean(busy) || !canSubmitWording}
                      onClick={() => void onPublish(it)}
                      className={primaryBtnClass}
                    >
                      {busy === "publish" ? "保存中…" : "保存修改"}
                    </button>
                  ) : null}
                </div>
              </div>
              {showingDetail ? (
                <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-[#1F2423]">
                  {it.body.trim() ? (
                    <p className="whitespace-pre-wrap">{it.body}</p>
                  ) : preview.detail ? (
                    <p className="whitespace-pre-wrap">{preview.detail}</p>
                  ) : (
                    <p className="text-[#969E9A]">暂无正文。</p>
                  )}
                  <p className="text-[12.5px] text-[#59625F]">
                    截止日期：
                    {it.dueAt ? it.dueAt.slice(0, 10) : "未设置"}
                  </p>
                  <p className="text-[12.5px] text-[#59625F]">
                    接收账号：{issuerLabel(it.assignedTo)}
                  </p>
                </div>
              ) : null}
              {it.replyText ? (
                <p className="mt-2 text-[13px] leading-relaxed text-[#1F2423]">
                  项目协作方答复：{it.replyText}
                </p>
              ) : null}
              {editing
                ? wordingForm({
                    existing: it,
                  })
                : null}
              {followUpOpen
                ? wordingForm({
                    lead: suggesting ? (
                      <p className="text-[12.5px] text-[#59625F]">判断中…</p>
                    ) : suggest ? (
                      <>
                        <p className="text-[12.5px] leading-relaxed text-[#1F2423]">
                          答复{suggest.complete ? "完整" : "不完整"}。
                          {suggest.completeness}
                        </p>
                        <p className="text-[12.5px] leading-relaxed text-[#1F2423]">
                          {suggest.shouldFollowUp ? "建议补充" : "可不补充"}。
                          {suggest.followUpAdvice}
                        </p>
                      </>
                    ) : null,
                  })
                : null}
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
          {canManage && composing ? (
            <div className="mb-2 rounded-xl border border-[rgba(78,66,57,0.08)] bg-white/80 px-4 py-3">
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1 text-[13px] font-semibold leading-relaxed text-[#1F2423]">
                  新增事项
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busy) || !canSaveDraft}
                    onClick={() => void onSaveDraft()}
                    className={ghostBtnClass}
                  >
                    {busy === "draft" ? "保存中…" : "保存草稿"}
                  </button>
                  <button
                    type="button"
                    className={ghostBtnClass}
                    onClick={() => setComposing(false)}
                  >
                    收起
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busy) || !canSubmitWording}
                    onClick={() => void onPublish()}
                    className={primaryBtnClass}
                  >
                    {busy === "publish" ? "发送中…" : "发送"}
                  </button>
                </div>
              </div>
              {wordingForm({})}
            </div>
          ) : null}
          {unsentList.length === 0 && !composing ? (
            <p className="mt-4 text-[13px] text-[#969E9A]">暂无未发事项。</p>
          ) : (
            <ul className="space-y-2">
              {unsentList.map((entry) => {
                const preview = entry.draft
                  ? previewCollabQuestion(entry.draft)
                  : extractOpenQuestionTitle(entry.text);
                const expanded = editingKey === entry.key;
                return (
                  <li
                    key={entry.key}
                    className="rounded-xl border border-[rgba(78,66,57,0.08)] bg-white/80 px-4 py-3"
                  >
                    <div className="flex items-center gap-4">
                      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-[#1F2423]">
                        <span className="mr-1.5 text-[11px] text-[#A06358]">
                          {entry.priority}
                        </span>
                        {entry.draft ? (
                          <span className="mr-1.5 text-[11px] font-medium text-[#5E9B75]">
                            草稿
                          </span>
                        ) : null}
                        {preview.title}
                      </div>
                      {canManage ? (
                        <div className="flex shrink-0 items-center gap-2">
                          {expanded ? (
                            <button
                              type="button"
                              disabled={Boolean(busy) || !canSaveDraft}
                              onClick={() => void onSaveDraft(entry.draft)}
                              className={ghostBtnClass}
                            >
                              {busy === "draft" ? "保存中…" : "保存草稿"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={ghostBtnClass}
                            onClick={() => openEdit(entry)}
                          >
                            {expanded ? "收起" : "编辑"}
                          </button>
                          <button
                            type="button"
                            disabled={
                              Boolean(busy) ||
                              (expanded && !canSubmitWording)
                            }
                            onClick={() =>
                              void (expanded
                                ? onPublish(entry.draft)
                                : onSendQuestion(entry))
                            }
                            className={primaryBtnClass}
                          >
                            {busy === entry.key ||
                            (expanded && busy === "publish")
                              ? "发送中…"
                              : "发送"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {expanded ? wordingForm({ existing: entry.draft }) : null}
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
