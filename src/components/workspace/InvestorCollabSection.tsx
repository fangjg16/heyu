import { useCallback, useEffect, useState } from "react";
import {
  collabStatusLabel,
  fetchCollabFiles,
  fetchCollabItems,
  fetchProjectFiles,
  fetchProjectKnowledgeChapter,
  publishCollabItem,
  reviewCollabItem,
  shareFileWithIssuer,
  type CollabItem,
  type CollabPriority,
  type CollabReplyMode,
  type ProjectFileRecord,
} from "@/lib/project-api";
import { parseOpenQuestionsFromHtml } from "@/lib/open-questions-parse";
import { getMergedProjects } from "@/workspace/project-registry";
import { getProjectRole } from "@/workspace/workspace-users";

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
  const canManage = role === "admin" || role === "core";

  const [sourceText, setSourceText] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [replyMode, setReplyMode] = useState<CollabReplyMode>("both");
  const [priority, setPriority] = useState<CollabPriority>("P2");
  const [dueAt, setDueAt] = useState("");
  const [investorNote, setInvestorNote] = useState("");
  const [fileReqLabel, setFileReqLabel] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

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
        (f) => f.scope === "package" && !String(f.relativePath ?? "").includes("项目方上传"),
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
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "加载失败"),
    );
  }, [load]);

  const onPublish = async () => {
    setBusy("publish");
    setError(null);
    try {
      await publishCollabItem(projectId, {
        title: title.trim() || sourceText.slice(0, 40),
        body: body.trim() || sourceText,
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
      <h2 className="text-[20px] font-semibold text-[#1F2423]">项目方协作</h2>
      <p className="mt-1 text-[13px] text-[#59625F]">
        内部待确认问题默认仅投资团队可见。确认对外措辞后发布，项目方才能看到。已确认答复会回写到知识网络「待确认问题」。
      </p>
      {error ? (
        <p className="mt-3 text-[13px] text-[#A06358]">{error}</p>
      ) : null}

      {canManage ? (
      <section className="mt-6 rounded-2xl border border-[rgba(78,66,57,0.1)] bg-white/80 p-5">
        <div className="text-[13px] font-semibold text-[#1F2423]">
          发布给项目方
        </div>
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
                if (!title.trim()) setTitle(t.slice(0, 48));
                if (!body.trim()) setBody(t);
              }
            }}
            className="mt-1 h-9 w-full rounded-lg border border-[rgba(78,66,57,0.12)] px-2 text-[13px]"
          >
            <option value="">选择内部问题，或下方手填</option>
            {questions.map((q) => (
              <option key={q.text} value={q.text}>
                {q.priority} · {q.text.slice(0, 80)}
              </option>
            ))}
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
          className="mt-3 h-10 rounded-xl bg-[#A06358] px-4 text-[13.5px] font-medium text-white disabled:opacity-45"
        >
          {busy === "publish" ? "发布中…" : "发布给项目方"}
        </button>
      </section>
      ) : (
        <p className="mt-4 text-[12.5px] text-[#969E9A]">
          发布与审核需 Admin / Core。你可查看已发布事项与授权状态。
        </p>
      )}

      <section className="mt-6">
        <div className="text-[13px] font-semibold text-[#1F2423]">已发布事项</div>
        {items.length === 0 ? (
          <p className="mt-2 text-[13px] text-[#969E9A]">尚未发布。</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {items.map((it) => (
              <li
                key={it.id}
                className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/80 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#1F2423]">{it.title}</div>
                    <div className="mt-1 text-[12px] text-[#969E9A]">
                      内部原题：{it.sourceQuestionText ?? "—"}
                    </div>
                  </div>
                  <span className="text-[11.5px] text-[#A06358]">
                    {collabStatusLabel(it.status)}
                  </span>
                </div>
                {it.replyText ? (
                  <p className="mt-2 text-[13px] leading-relaxed text-[#1F2423]">
                    项目方答复：{it.replyText}
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
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="text-[13px] font-semibold text-[#1F2423]">
          逐份授权源文件给项目方
        </div>
        <p className="mt-1 text-[12px] text-[#59625F]">
          默认不共享。勾选后项目方才能在其「源文件」中看到（投资方共享）。
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
