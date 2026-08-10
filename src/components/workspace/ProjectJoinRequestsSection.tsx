import { useCallback, useEffect, useState } from "react";
import {
  ENABLE_LIVE_CHAT,
  fetchMyProjectRoles,
  fetchProjectJoinRequests,
  reviewJoinRequest,
  type ProjectJoinRequest,
} from "@/lib/project-api";
import { setMyProjectRoles } from "@/workspace/project-role-cache";
import { listCachedWorkspaceUsers } from "@/workspace/workspace-users";
import type { WorkspaceProject } from "@/workspace/projects";
import { cn } from "@/lib/utils";

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

  const onReview = (req: ProjectJoinRequest, status: "approved" | "rejected") => {
    if (busyId) return;
    setBusyId(req.id);
    setError(null);
    void reviewJoinRequest(project.id, req.id, status)
      .then(async () => {
        setRequests((prev) => prev.filter((r) => r.id !== req.id));
        try {
          const roles = await fetchMyProjectRoles(userId);
          setMyProjectRoles(roles);
        } catch {
          /* 角色缓存刷新失败不阻断 */
        }
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
        审批来自项目广场的加入申请；通过后申请人将获得项目成员权限。
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
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.82)] px-4 py-3.5"
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
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busyId === req.id}
                  onClick={() => onReview(req, "rejected")}
                  className={cn(
                    "h-8 rounded-lg border border-[rgba(78,66,57,0.18)] px-3 text-[12.5px]",
                    "text-[hsl(var(--warm-charcoal-muted))] hover:bg-[rgba(78,66,57,0.06)] disabled:opacity-50",
                  )}
                >
                  拒绝
                </button>
                <button
                  type="button"
                  disabled={busyId === req.id}
                  onClick={() => onReview(req, "approved")}
                  className="h-8 rounded-lg bg-[hsl(var(--wine))] px-3 text-[12.5px] font-medium text-white hover:bg-[hsl(var(--wine-hover))] disabled:opacity-50"
                >
                  通过
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
