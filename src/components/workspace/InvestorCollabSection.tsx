import { useCallback, useEffect, useState } from "react";
import {
  collabStatusLabel,
  fetchCollabFiles,
  fetchCollabItems,
  fetchProjectFiles,
  fetchProjectKnowledgeChapter,
  publishCollabItem,
  publishOpenQuestionToIssuer,
  reviewCollabItem,
  shareFileWithIssuer,
  type CollabItem,
  type CollabPriority,
  type CollabReplyMode,
  type ProjectFileRecord,
} from "@/lib/project-api";
import { parseOpenQuestionsFromHtml } from "@/lib/open-questions-parse";
import {
  extractOpenQuestionTitle,
  formatOpenQuestionForIssuer,
  previewCollabQuestion,
  stripCitationMarkers,
} from "@/lib/kn-citations";
import { getMergedProjects } from "@/workspace/project-registry";
import { canPublishToIssuer, getProjectRole } from "@/workspace/workspace-users";

type InvestorCollabSectionProps = {
  projectId: string;
  userId: string;
};

export function InvestorCollabSection({
  projectId,
  userId,
}: InvestorCollabSectionProps) {
  const [items, setItems] = useState<CollabItem[]>([]);
  const [files, setFiles] = useState<ProjectFileRecord[]>([]);
  const [questions, setQuestions] = useState<{ text: string; priority: CollabPriority }[]>(
    [],
  );
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const project = getMergedProjects().find((p) => p.id === projectId);
  const role = getProjectRole(userId, projectId, project?.createdBy);
  const canManage = canPublishToIssuer(role);

  const [sourceText, setSourceText] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [replyMode, setReplyMode] = useState<CollabReplyMode>("both");
  const [priority, setPriority] = useState<CollabPriority>("P2");
  const [dueAt, setDueAt] = useState("");
  const [investorNote, setInvestorNote] = useState("");
  const [fileReqLabel, setFileReqLabel] = useState("");
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
    const [its, ch, fl, shared] = await Promise.all([
      fetchCollabItems(projectId),
      fetchProjectKnowledgeChapter(projectId, "questions", userId).catch(
        () => null,
      ),
      fetchProjectFiles(projectId, userId).catch(() => []),
      fetchCollabFiles(projectId).catch(() => []),
    ]);
    setItems(its);
    if (ch?.html) {
      setQuestions(
        parseOpenQuestionsFromHtml(ch.html).map((q) => ({
          text: q.text,
          priority: q.priority,
        })),
      );
    }
    setFiles(
      fl.filter(
        (f) => {
          const path = String(f.relativePath ?? "");
          return (
            f.scope === "package" &&
            !path.includes("项目方上传") &&
            !path.includes("项目协作方上传")
          );
        },
      ),
    );
    setSharedIds(
      new Set(
        shared
          .filter(
            (f) =>
              f.sharedWithIssuer ||
              f.sourceKind === "investor_share" ||
              f.sourceKind === "public_source",
          )
          .map((f) => f.id),
      ),
    );
  }, [projectId, userId]);

  useEffect(() => {
    if (!incomingDraft) return;
    const t = incomingDraft.sourceText;
    const q = questions.find((x) => x.text === t);
    setSourceText(t);
    const formatted = formatOpenQuestionForIssuer(t);
    setTitle((prev) => prev.trim() || incomingDraft.title || formatted.title);
    setBody((prev) => prev.trim() || formatted.body);
    setPriority(q?.priority ?? incomingDraft.priority ?? "P2");
  }, [incomingDraft, questions]);

  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "加载失败"),
    );
  }, [load]);

  const unpublishedQuestions = questions.filter(
    (q) => !items.some((it) => it.sourceQuestionText === q.text),
  );

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
    if (unpublishedQuestions.length === 0) return;
    setBusy("publish-all");
    setError(null);
    try {
      for (const q of unpublishedQuestions) {
        await publishOpenQuestionToIssuer(projectId, {
          text: q.text,
          title: q.text.slice(0, 80),
          priority: q.priority,
        });
      }
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
    setBusy("publish");
    setError(null);
    try {
      await publishCollabItem(projectId, {
        title:
          stripCitationMarkers(title.trim() || sourceText).slice(0, 80) ||
          formatOpenQuestionForIssuer(sourceText).title,
        body:
          stripCitationMarkers(body.trim() || sourceText) ||
          formatOpenQuestionForIssuer(sourceText).body,
        sourceQuestionText: sourceText,
        replyMode,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        investorNote: investorNote.trim() || null,
        fileReqs: fileReqLabel.trim()
          ? [{ id: crypto.randomUUID(), label: fileReqLabel.trim(), required: true }]
          : [],
      });
      setTitle("");
      setBody("");
      setSourceText("");
      setFileReqLabel("");
      setInvestorNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "发布失败");
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

  const onShare = async (docId: string, shared: boolean) => {
    setBusy(docId);
    try {
      await shareFileWithIssuer(projectId, docId, shared, "investor_share");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "授权失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8 md:px-10">
      <h2 className="text-[20px] font-semibold text-[#1F2423]">项目协作方协作</h2>
      <p className="mt-1 text-[13px] text-[#59625F]">
        {canManage
          ? "内部问题默认按原文一键发给项目协作方（发布后冻结）。有投资判断的条目再改措辞。文件仍需逐份勾选共享。"
          : "已发布事项与文件授权状态可在此查看。"}
      </p>
      {error ? (
        <p className="mt-3 text-[13px] text-[#A06358]">{error}</p>
      ) : null}

      {canManage && unpublishedQuestions.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-[rgba(78,66,57,0.1)] bg-white/80 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13px] font-semibold text-[#1F2423]">
              未发给项目协作方（{unpublishedQuestions.length}）
            </div>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void onSendAllUnpublished()}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-[#A06358] px-3 text-[12.5px] font-medium leading-none text-white disabled:opacity-45"
            >
              {busy === "publish-all" ? "发送中…" : "全部按原文发给项目协作方"}
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {unpublishedQuestions.map((q) => {
              const preview = extractOpenQuestionTitle(q.text);
              return (
              <li
                key={q.text}
                className="flex items-start justify-between gap-3 rounded-xl border border-[rgba(78,66,57,0.08)] px-3 py-2.5"
              >
                <div className="min-w-0 text-[13px] leading-relaxed text-[#1F2423]">
                  <span className="mr-1.5 text-[11px] text-[#A06358]">{q.priority}</span>
                  {preview.title}
                  {preview.detail ? (
                    <div className="mt-1 text-[12px] text-[#59625F] line-clamp-2">
                      {preview.detail}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void onSendQuestion(q)}
                  className="shrink-0 text-[12.5px] font-medium text-[#A06358] disabled:opacity-45"
                >
                  {busy === q.text ? "发送中…" : "发给项目协作方"}
                </button>
              </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {canManage ? (
      <section className="mt-6 rounded-2xl border border-[rgba(78,66,57,0.1)] bg-white/80 p-5">
        <div className="text-[13px] font-semibold text-[#1F2423]">
          改措辞后单独发布
        </div>
        <p className="mt-1 text-[12px] text-[#59625F]">
          仅在内部原文不宜直接给项目协作方时使用。一般条目用上方一键发送即可。
        </p>
        <label className="mt-3 block text-[12px] text-[#59625F]">
          对应内部问题
          <select
            value={sourceText}
            onChange={(e) => {
              const t = e.target.value;
              setSourceText(t);
              const q = questions.find((x) => x.text === t);
              if (q) {
                setPriority(q.priority);
                const formatted = formatOpenQuestionForIssuer(t);
                if (!title.trim()) setTitle(formatted.title);
                if (!body.trim()) setBody(formatted.body);
              }
            }}
            className="mt-1 h-9 w-full rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[13px]"
          >
            <option value="">选择内部问题，或下方手填</option>
            {questions.map((q) => {
              const published = items.some(
                (it) => it.sourceQuestionText === q.text,
              );
              return (
              <option key={q.text} value={q.text}>
                {published ? "已发布 · " : ""}
                {q.priority} · {extractOpenQuestionTitle(q.text).title.slice(0, 80)}
              </option>
              );
            })}
          </select>
        </label>
        <input
          className="mt-2 h-9 w-full rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[13px]"
          placeholder="对外中性标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="mt-2 w-full rounded-lg border border-[rgba(78,66,57,0.12)] px-2 py-2 text-[13px]"
          rows={4}
          placeholder="需确认的具体内容（发布后冻结）"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <select
            value={replyMode}
            onChange={(e) => setReplyMode(e.target.value as CollabReplyMode)}
            className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[13px]"
          >
            <option value="both">文字 + 文件</option>
            <option value="text">仅文字</option>
            <option value="file">仅文件</option>
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as CollabPriority)}
            className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[13px]"
          >
            <option value="P1">P1 紧急</option>
            <option value="P2">P2 重要</option>
            <option value="P3">P3 跟进</option>
          </select>
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="h-9 rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[13px]"
          />
        </div>
        <input
          className="mt-2 h-9 w-full rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[13px]"
          placeholder="待补充文件（可选，一条）"
          value={fileReqLabel}
          onChange={(e) => setFileReqLabel(e.target.value)}
        />
        <input
          className="mt-2 h-9 w-full rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[13px]"
          placeholder="对外补充说明（可选）"
          value={investorNote}
          onChange={(e) => setInvestorNote(e.target.value)}
        />
        <button
          type="button"
          disabled={Boolean(busy) || !body.trim()}
          onClick={() => void onPublish()}
          className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-[#A06358] px-4 text-[13.5px] font-medium leading-none text-white disabled:opacity-45"
        >
          {busy === "publish" ? "发布中…" : "发布给项目协作方"}
        </button>
      </section>
      ) : null}

      <section className="mt-6">
        <div className="text-[13px] font-semibold text-[#1F2423]">已发布事项</div>
        {items.length === 0 ? (
          <p className="mt-2 text-[13px] text-[#969E9A]">尚未发布。</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {items.map((it) => {
              const preview = previewCollabQuestion(it);
              return (
              <li
                key={it.id}
                className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/80 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#1F2423]">{preview.title}</div>
                    {preview.detail ? (
                      <div className="mt-1 text-[12.5px] text-[#59625F] line-clamp-2">
                        {preview.detail}
                      </div>
                    ) : null}
                    <div className="mt-1 text-[12px] text-[#969E9A]">
                      内部原题：
                      {stripCitationMarkers(it.sourceQuestionText ?? "") || "—"}
                    </div>
                  </div>
                  <span className="text-[11.5px] text-[#A06358]">
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
        )}
      </section>

      <section className="mt-8">
        <div className="text-[13px] font-semibold text-[#1F2423]">
          逐份授权源文件给项目协作方
        </div>
        <p className="mt-1 text-[12px] text-[#59625F]">
          默认不共享。勾选后项目协作方才能在其「源文件」中看到（投资方共享）。
        </p>
        <ul className="mt-2 max-h-[360px] overflow-auto divide-y divide-[rgba(78,66,57,0.08)] rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/80">
          {files.length === 0 ? (
            <li className="px-3 py-3 text-[13px] text-[#969E9A]">暂无可授权文件。</li>
          ) : null}
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"
            >
              <span className="min-w-0 truncate">{f.filename}</span>
              <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-[#59625F]">
                <input
                  type="checkbox"
                  checked={sharedIds.has(f.id)}
                  disabled={!canManage || Boolean(busy)}
                  onChange={(e) => void onShare(f.id, e.target.checked)}
                />
                共享
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
