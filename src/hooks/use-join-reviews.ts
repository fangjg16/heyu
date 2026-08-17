import { useCallback, useEffect, useState } from "react";
import {
  ENABLE_LIVE_CHAT,
  fetchMyJoinReviews,
  reviewJoinRequest,
  type JoinApproveRole,
  type ProjectJoinRequest,
} from "@/lib/project-api";

const JOIN_REVIEWS_EVENT = "hy-join-reviews-changed";

export function notifyJoinReviewsChanged(): void {
  window.dispatchEvent(new Event(JOIN_REVIEWS_EVENT));
}

export function useJoinReviews(): {
  requests: ProjectJoinRequest[];
  pendingCount: number;
  loading: boolean;
  error: string | null;
  busyId: string | null;
  reload: () => void;
  review: (
    req: ProjectJoinRequest,
    status: "approved" | "rejected",
    role?: JoinApproveRole,
  ) => Promise<void>;
} {
  const [requests, setRequests] = useState<ProjectJoinRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!ENABLE_LIVE_CHAT) {
      setRequests([]);
      return;
    }
    setLoading(true);
    setError(null);
    void fetchMyJoinReviews()
      .then((rows) => setRequests(rows.filter((r) => r.status === "pending")))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "加载加入申请失败");
        setRequests([]);
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

  return {
    requests,
    pendingCount: requests.length,
    loading,
    error,
    busyId,
    reload,
    review,
  };
}
