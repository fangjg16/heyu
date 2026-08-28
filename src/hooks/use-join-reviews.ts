import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ENABLE_LIVE_CHAT,
  fetchMyInbox,
  markMyNoticesRead,
  reviewJoinRequest,
  type CollabSubmitNotice,
  type JoinApproveRole,
  type ProjectJoinRequest,
  type ProjectNoticeItem,
} from "@/lib/project-api";
import { isNoticeActivityKind, isNoticeTodoKind } from "@/workspace/notice-groups";

const JOIN_REVIEWS_EVENT = "hy-join-reviews-changed";

export function notifyJoinReviewsChanged(): void {
  window.dispatchEvent(new Event(JOIN_REVIEWS_EVENT));
}

export function useJoinReviews(): {
  requests: ProjectJoinRequest[];
  reviewed: ProjectJoinRequest[];
  collabSubmitted: CollabSubmitNotice[];
  projectNotices: ProjectNoticeItem[];
  todoNotices: ProjectNoticeItem[];
  activityNotices: ProjectNoticeItem[];
  todoCount: number;
  activityUnreadCount: number;
  pendingCount: number;
  loading: boolean;
  error: string | null;
  busyId: string | null;
  reload: () => void;
  markRead: (ids: string[]) => Promise<void>;
  review: (
    req: ProjectJoinRequest,
    status: "approved" | "rejected",
    role?: JoinApproveRole,
  ) => Promise<void>;
} {
  const [requests, setRequests] = useState<ProjectJoinRequest[]>([]);
  const [reviewed, setReviewed] = useState<ProjectJoinRequest[]>([]);
  const [collabSubmitted, setCollabSubmitted] = useState<CollabSubmitNotice[]>(
    [],
  );
  const [projectNotices, setProjectNotices] = useState<ProjectNoticeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!ENABLE_LIVE_CHAT) {
      setRequests([]);
      setReviewed([]);
      setCollabSubmitted([]);
      setProjectNotices([]);
      return;
    }
    setLoading(true);
    setError(null);
    void fetchMyInbox()
      .then((inbox) => {
        setRequests(inbox.pending);
        setReviewed(inbox.reviewed);
        setCollabSubmitted(inbox.collabSubmitted);
        setProjectNotices(inbox.projectNotices);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "加载通知失败");
        setRequests([]);
        setReviewed([]);
        setCollabSubmitted([]);
        setProjectNotices([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    const onChange = () => reload();
    window.addEventListener(JOIN_REVIEWS_EVENT, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener(JOIN_REVIEWS_EVENT, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [reload]);

  const review = useCallback(
    async (
      req: ProjectJoinRequest,
      status: "approved" | "rejected",
      role?: JoinApproveRole,
    ) => {
      if (busyId) return;
      setBusyId(req.id);
      setError(null);
      try {
        await reviewJoinRequest(req.projectId, req.id, status, {
          role: status === "approved" ? role ?? "low" : undefined,
        });
        setRequests((prev) => prev.filter((r) => r.id !== req.id));
        notifyJoinReviewsChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : "审批失败");
        throw e;
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  const markRead = useCallback(async (ids: string[]) => {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (unique.length === 0) return;
    const stamped = new Date().toISOString();
    setProjectNotices((prev) =>
      prev.map((n) =>
        unique.includes(n.id) && !n.readAt?.trim() ? { ...n, readAt: stamped } : n,
      ),
    );
    try {
      await markMyNoticesRead(unique);
    } catch (e) {
      setError(e instanceof Error ? e.message : "标记已读失败");
      reload();
    }
  }, [reload]);

  const todoNotices = useMemo(
    () =>
      projectNotices.filter(
        (n) => isNoticeTodoKind(n.kind) && !n.readAt?.trim(),
      ),
    [projectNotices],
  );
  const activityNotices = useMemo(
    () => projectNotices.filter((n) => isNoticeActivityKind(n.kind)),
    [projectNotices],
  );
  const activityUnreadCount = activityNotices.filter(
    (n) => !n.readAt?.trim(),
  ).length;
  const todoCount =
    requests.length + collabSubmitted.length + todoNotices.length;

  return {
    requests,
    reviewed,
    collabSubmitted,
    projectNotices,
    todoNotices,
    activityNotices,
    todoCount,
    activityUnreadCount,
    pendingCount: todoCount,
    loading,
    error,
    busyId,
    reload,
    markRead,
    review,
  };
}
