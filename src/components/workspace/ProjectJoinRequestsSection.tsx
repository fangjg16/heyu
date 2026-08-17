import { useCallback, useEffect, useState } from "react";
import {
  ENABLE_LIVE_CHAT,
  fetchMyProjectRoles,
  fetchProjectJoinRequests,
  reviewJoinRequest,
  type JoinApproveRole,
  type ProjectJoinRequest,
} from "@/lib/project-api";
import { setMyProjectRoles } from "@/workspace/project-role-cache";
import { notifyJoinReviewsChanged } from "@/hooks/use-join-reviews";
import { listCachedWorkspaceUsers } from "@/workspace/workspace-users";
import type { WorkspaceProject } from "@/workspace/projects";
import { JoinRequestReviewBar } from "@/components/workspace/JoinRequestReviewBar";

type ProjectJoinRequestsSectionProps = {
  project: WorkspaceProject;
  userId: string;
};

function displayNameFor(userId: string): string {
  const u = listCachedWorkspaceUsers().find((x) => x.id === userId);
  return u?.displayName?.trim() || userId;
}

export function ProjectJoinRequestsSection({
  project,
  userId,
}: ProjectJoinRequestsSectionProps) {
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
    void fetchProjectJoinRequests(project.id, { status: "pending" })
      .then((rows) => setRequests(rows))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "加载加入申请失败");
        setRequests([]);
      })
      .finally(() => setLoading(false));
  }, [project.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onReview = (
    req: ProjectJoinRequest,
    status: "approved" | "rejected",
    role?: JoinApproveRole,
  ) => {
    if (busyId) return;
    setBusyId(req.id);
    setError(null);
    void reviewJoinRequest(project.id, req.id, status, {
      role: status === "approved" ? role ?? "low" : undefined,
    })
      .then(async () => {
        setRequests((prev) => prev.filter((r) => r.id !== req.id));
        try {
          const roles = await fetchMyProjectRoles(userId);
          setMyProjectRoles(roles);
        } catch {
          /* 角色缓存刷新失败不阻断 */
        }
        notifyJoinReviewsChanged();
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "审批失败");
      })
      .finally(() => setBusyId(null));
  };

  return (
    <div>
      <h2 className="font-display text-lg font-semibold">加入申请</h2>
      <p className="mt-1 text-sm text-[hsl(var(--warm-charcoal-muted))]">
        审批来自项目广场的加入申请。通过时先选项目方或投资方；投资方再指定项目管理员 / Core / Basic（默认 Basic）。
      </p>
      {loading ? (
        <p className="mt-3 text-sm text-[hsl(var(--warm-charcoal-muted))]">
          加载中…
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-amber-800">{error}</p>
      ) : null}
      {!loading && requests.length === 0 ? (
        <p className="mt-4 rounded-xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.7)] px-4 py-5 text-sm text-[hsl(var(--warm-charcoal-muted))]">
          暂无待审批申请
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {requests.map((req) => (
            <li
              key={req.id}
              className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.82)] px-4 py-3.5"
            >
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-[hsl(var(--warm-charcoal))]">
                  {displayNameFor(req.applicantUserId)}
                </div>
                <div className="mt-0.5 text-[12px] text-[hsl(var(--warm-charcoal-muted))]">
                  {req.applicantUserId}
                  {req.createdAt
                    ? ` · ${new Date(req.createdAt).toLocaleString("zh-CN")}`
                    : ""}
                </div>
              </div>
              <JoinRequestReviewBar
                disabled={busyId === req.id}
                approveClassName="bg-[hsl(var(--wine))] hover:bg-[hsl(var(--wine-hover))]"
                onApprove={(role) => onReview(req, "approved", role)}
                onReject={() => onReview(req, "rejected")}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
