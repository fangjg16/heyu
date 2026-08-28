import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { JoinRequestReviewBar } from "@/components/workspace/JoinRequestReviewBar";
import { useJoinReviews } from "@/hooks/use-join-reviews";
import { cn } from "@/lib/utils";
import type { ProjectJoinRequest } from "@/lib/project-api";
import { groupActivityNotices } from "@/workspace/notice-groups";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN");
}

function joinStatusLabel(req: ProjectJoinRequest): string {
  if (req.status === "approved") return "已通过";
  if (req.status === "rejected") return "已拒绝";
  return "待处理";
}

export default function Notifications() {
  const navigate = useNavigate();
  const {
    requests,
    reviewed,
    collabSubmitted,
    todoNotices,
    activityNotices,
    todoCount,
    activityUnreadCount,
    loading,
    error,
    busyId,
    review,
    markRead,
  } = useJoinReviews();
  const [tab, setTab] = useState<"todo" | "feed">("todo");
  const [tabPicked, setTabPicked] = useState(false);
  const [todoPane, setTodoPane] = useState<"pending" | "done">("pending");

  const activityGroups = useMemo(
    () => groupActivityNotices(activityNotices),
    [activityNotices],
  );

  useEffect(() => {
    if (loading || tabPicked) return;
    if (todoCount === 0 && activityUnreadCount > 0) setTab("feed");
  }, [loading, tabPicked, todoCount, activityUnreadCount]);

  const todoEmpty =
    requests.length === 0 &&
    collabSubmitted.length === 0 &&
    todoNotices.length === 0;

  const headline =
    todoCount > 0
      ? `${todoCount} 条待办`
      : activityUnreadCount > 0
        ? `${activityUnreadCount} 条未读动态`
        : "没有待办。";

  const onOpenNotice = (ids: string[], href: string | null) => {
    void markRead(ids);
    if (href) navigate(href);
  };

  const onOpenReview = (href: string | null) => {
    if (href) navigate(href);
  };

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-[880px] px-8 py-10 md:px-12">
        <h1 className="font-display text-[32px] font-semibold tracking-wide">
          通知
        </h1>
        <p className="mt-2 text-[hsl(var(--warm-charcoal-muted))]">{headline}</p>
        {error ? (
          <p className="mt-3 text-sm text-[#A06358]">{error}</p>
        ) : null}

        <div className="mt-6 flex gap-1 rounded-xl bg-[rgba(78,66,57,0.06)] p-1">
          <button
            type="button"
            onClick={() => {
              setTabPicked(true);
              setTab("todo");
            }}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              tab === "todo"
                ? "bg-white text-[#1F2423] shadow-sm"
                : "text-[#59625F] hover:text-[#1F2423]",
            )}
          >
            待办
            {todoCount > 0 ? (
              <span className="ml-1.5 text-[12px] font-medium text-[#A06358]">
                {todoCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => {
              setTabPicked(true);
              setTab("feed");
            }}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              tab === "feed"
                ? "bg-white text-[#1F2423] shadow-sm"
                : "text-[#59625F] hover:text-[#1F2423]",
            )}
          >
            动态
            {activityUnreadCount > 0 ? (
              <span className="ml-1.5 text-[12px] font-medium text-[#A06358]">
                {activityUnreadCount}
              </span>
            ) : null}
          </button>
        </div>

        {loading && todoEmpty && activityNotices.length === 0 && reviewed.length === 0 ? (
          <p className="mt-8 text-sm text-[hsl(var(--warm-charcoal-muted))]">
            加载中…
          </p>
        ) : tab === "todo" ? (
          todoEmpty && reviewed.length === 0 ? (
            <div className="heyu-card mt-8 border border-[rgba(255,255,255,0.65)] bg-[rgba(255,252,248,0.88)] px-6 py-10 text-center text-sm text-[hsl(var(--warm-charcoal-muted))] shadow-[0_8px_24px_rgba(102,80,60,0.06)]">
              加入申请、协作提交与知识网络待审会显示在这里。资料上传删除在「动态」。
            </div>
          ) : (
            <>
            <div className="mt-8 flex items-center gap-5 border-b border-[rgba(78,66,57,0.1)]">
              {(
                [
                  { key: "pending" as const, label: "待处理", count: todoCount },
                  { key: "done" as const, label: "已办", count: reviewed.length },
                ] as const
              ).map((pane) => (
                <button
                  key={pane.key}
                  type="button"
                  onClick={() => setTodoPane(pane.key)}
                  className={cn(
                    "relative -mb-px pb-2.5 text-[13px] transition-colors",
                    todoPane === pane.key
                      ? "font-semibold text-[#1F2423]"
                      : "font-medium text-[#969E9A] hover:text-[#59625F]",
                  )}
                >
                  {pane.label}
                  <span
                    className={cn(
                      "ml-1.5 tabular-nums",
                      todoPane === pane.key ? "text-[#A06358]" : "text-[#C4BEB6]",
                    )}
                  >
                    {pane.count}
                  </span>
                  {todoPane === pane.key ? (
                    <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#A06358]" />
                  ) : null}
                </button>
              ))}
            </div>
            {todoPane === "pending" ? (
            <div className="mt-6 space-y-8">
              {todoEmpty ? (
                <div className="heyu-card border border-[rgba(255,255,255,0.65)] bg-[rgba(255,252,248,0.88)] px-6 py-10 text-center text-sm text-[hsl(var(--warm-charcoal-muted))] shadow-[0_8px_24px_rgba(102,80,60,0.06)]">
                  没有待办。
                  {reviewed.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setTodoPane("done")}
                      className="ml-1 font-medium text-[#A06358] hover:underline"
                    >
                      查看已办
                    </button>
                  ) : null}
                </div>
              ) : null}
              {todoNotices.length > 0 ? (
                <section>
                  <h2 className="text-[13px] font-semibold tracking-wide text-[#59625F]">
                    知识网络
                  </h2>
                  <ul className="mt-3 space-y-3">
                    {todoNotices.map((item) => (
                      <li
                        key={item.id}
                        className="heyu-card border border-[rgba(255,255,255,0.65)] bg-[rgba(255,252,248,0.88)] px-5 py-4 shadow-[0_8px_24px_rgba(102,80,60,0.06)]"
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#A06358]" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[15px] font-semibold text-[#1F2423]">
                              {item.title}
                            </div>
                            <div className="mt-1 text-[13px] text-[#1F2423]">
                              {item.summary}
                            </div>
                            <div className="mt-1 text-[12.5px] text-[#969E9A]">
                              {formatWhen(item.createdAt)}
                            </div>
                            <div className="mt-3 flex items-center gap-3">
                              {item.href ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenReview(item.href)}
                                  className="inline-flex h-8 items-center text-[13px] font-medium text-[#A06358] hover:underline"
                                >
                                  去审核 →
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {collabSubmitted.length > 0 ? (
                <section>
                  <h2 className="text-[13px] font-semibold tracking-wide text-[#59625F]">
                    项目协作
                  </h2>
                  <ul className="mt-3 space-y-3">
                    {collabSubmitted.map((item) => (
                      <li
                        key={item.id}
                        className="heyu-card border border-[rgba(255,255,255,0.65)] bg-[rgba(255,252,248,0.88)] px-5 py-4 shadow-[0_8px_24px_rgba(102,80,60,0.06)]"
                      >
                        <div className="text-[15px] font-semibold text-[#1F2423]">
                          {item.replyByName}
                          <span className="font-normal text-[#59625F]">
                            {" "}
                            提交了协作资料
                          </span>
                        </div>
                        <div className="mt-1 text-[13px] text-[#1F2423]">
                          {item.projectName}
                          {item.title ? ` · ${item.title}` : ""}
                        </div>
                        <div className="mt-1 text-[12.5px] text-[#969E9A]">
                          {formatWhen(item.replySubmittedAt)}
                        </div>
                        <Link
                          to={`/app/projects/${encodeURIComponent(item.projectId)}/collab`}
                          className="mt-3 inline-flex h-8 items-center text-[13px] font-medium text-[#A06358] hover:underline"
                        >
                          查看协作 →
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {requests.length > 0 ? (
                <section>
                  <h2 className="text-[13px] font-semibold tracking-wide text-[#59625F]">
                    加入申请
                  </h2>
                  <ul className="mt-3 space-y-3">
                    {requests.map((req) => (
                      <li
                        key={req.id}
                        className="heyu-card border border-[rgba(255,255,255,0.65)] bg-[rgba(255,252,248,0.88)] px-5 py-4 shadow-[0_8px_24px_rgba(102,80,60,0.06)]"
                      >
                        <div className="text-[15px] font-semibold text-[#1F2423]">
                          {req.applicantDisplayName ?? req.applicantUserId}
                          <span className="font-normal text-[#59625F]">
                            {" "}
                            申请加入
                          </span>{" "}
                          {req.projectName ?? "项目"}
                        </div>
                        <div className="mt-1 text-[12.5px] text-[#969E9A]">
                          {formatWhen(req.createdAt)}
                        </div>
                        <JoinRequestReviewBar
                          disabled={busyId === req.id}
                          onApprove={(role) => void review(req, "approved", role)}
                          onReject={() => void review(req, "rejected")}
                          extra={
                            <Link
                              to={`/app/projects/${encodeURIComponent(req.projectId)}/overview`}
                              className="inline-flex h-8 items-center px-1 text-[13px] text-[hsl(var(--warm-charcoal-muted))] transition-colors hover:text-[hsl(var(--wine))]"
                            >
                              打开项目 →
                            </Link>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

            </div>
            ) : reviewed.length === 0 ? (
              <div className="heyu-card mt-6 border border-[rgba(255,255,255,0.65)] bg-[rgba(255,252,248,0.88)] px-6 py-10 text-center text-sm text-[hsl(var(--warm-charcoal-muted))] shadow-[0_8px_24px_rgba(102,80,60,0.06)]">
                还没有已处理的加入申请。
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {reviewed.map((req) => (
                  <li
                    key={req.id}
                    className="heyu-card border border-[rgba(255,255,255,0.65)] bg-[rgba(255,252,248,0.88)] px-5 py-4 shadow-[0_8px_24px_rgba(102,80,60,0.06)]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          req.status === "approved"
                            ? "bg-[rgba(94,155,117,0.14)] text-[#3F7A52]"
                            : "bg-[rgba(160,99,88,0.12)] text-[#A06358]",
                        )}
                      >
                        {joinStatusLabel(req)}
                      </span>
                      <span className="text-[15px] font-semibold text-[#1F2423]">
                        {req.applicantDisplayName ?? req.applicantUserId}
                      </span>
                      <span className="text-[14px] text-[#59625F]">
                        加入 {req.projectName ?? "项目"}
                      </span>
                    </div>
                    <div className="mt-1.5 text-[12.5px] text-[#969E9A]">
                      {req.reviewedByDisplayName
                        ? `${req.reviewedByDisplayName} · `
                        : ""}
                      {formatWhen(req.reviewedAt ?? req.updatedAt)}
                    </div>
                    <Link
                      to={`/app/projects/${encodeURIComponent(req.projectId)}/overview`}
                      className="mt-3 inline-flex h-8 items-center text-[13px] text-[hsl(var(--warm-charcoal-muted))] transition-colors hover:text-[hsl(var(--wine))]"
                    >
                      打开项目 →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            </>
          )
        ) : activityGroups.length === 0 ? (
          <div className="heyu-card mt-8 border border-[rgba(255,255,255,0.65)] bg-[rgba(255,252,248,0.88)] px-6 py-10 text-center text-sm text-[hsl(var(--warm-charcoal-muted))] shadow-[0_8px_24px_rgba(102,80,60,0.06)]">
            还没有项目资料动态。
          </div>
        ) : (
          <div className="mt-8">
            {activityUnreadCount > 0 ? (
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    void markRead(
                      activityNotices
                        .filter((n) => !n.readAt?.trim())
                        .map((n) => n.id),
                    )
                  }
                  className="text-[12.5px] font-medium text-[#A06358] hover:underline"
                >
                  全部标为已读
                </button>
              </div>
            ) : null}
            <ul className="space-y-3">
              {activityGroups.map((item) => (
                <li
                  key={item.ids[0]}
                  className={cn(
                    "heyu-card border border-[rgba(255,255,255,0.65)] bg-[rgba(255,252,248,0.88)] px-5 py-4 shadow-[0_8px_24px_rgba(102,80,60,0.06)]",
                    !item.unread && "opacity-70",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        item.unread ? "bg-[#A06358]" : "bg-transparent",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold text-[#1F2423]">
                        {item.title}
                      </div>
                      <div className="mt-1 text-[13px] text-[#1F2423]">
                        {item.summary}
                      </div>
                      {item.files.length > 1 ? (
                        <div className="mt-1 line-clamp-2 text-[12.5px] text-[#59625F]">
                          {item.files.join("、")}
                        </div>
                      ) : null}
                      <div className="mt-1 text-[12.5px] text-[#969E9A]">
                        {formatWhen(item.createdAt)}
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        {item.href ? (
                          <button
                            type="button"
                            onClick={() => onOpenNotice(item.ids, item.href)}
                            className="inline-flex h-8 items-center text-[13px] font-medium text-[#A06358] hover:underline"
                          >
                            查看 →
                          </button>
                        ) : null}
                        {item.unread ? (
                          <button
                            type="button"
                            onClick={() => void markRead(item.ids)}
                            className="inline-flex h-8 items-center text-[13px] text-[hsl(var(--warm-charcoal-muted))] hover:text-[#1F2423]"
                          >
                            知道了
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
