import { Link } from "react-router-dom";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { JoinRequestReviewBar } from "@/components/workspace/JoinRequestReviewBar";
import { useJoinReviews } from "@/hooks/use-join-reviews";

export default function Notifications() {
  const { requests, pendingCount, loading, error, busyId, review } = useJoinReviews();

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-[880px] px-8 py-10 md:px-12">
        <h1 className="font-display text-[32px] font-semibold tracking-wide">
          通知
        </h1>
        <p className="mt-2 text-[hsl(var(--warm-charcoal-muted))]">
          {pendingCount > 0
            ? `${pendingCount} 条待审批的加入申请`
            : "暂无待处理的加入申请。"}
        </p>
        {error ? (
          <p className="mt-3 text-sm text-[#A06358]">{error}</p>
        ) : null}

        {loading && requests.length === 0 ? (
          <p className="mt-8 text-sm text-[hsl(var(--warm-charcoal-muted))]">
            加载中…
          </p>
        ) : requests.length === 0 ? (
          <div className="heyu-card mt-8 border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.82)] px-6 py-10 text-center text-sm text-[hsl(var(--warm-charcoal-muted))]">
            有人从项目广场申请加入时，会出现在这里。
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {requests.map((req) => (
              <li
                key={req.id}
                className="heyu-card border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.82)] px-5 py-4"
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
                  {req.createdAt
                    ? new Date(req.createdAt).toLocaleString("zh-CN")
                    : ""}
                </div>
                <JoinRequestReviewBar
                  disabled={busyId === req.id}
                  onApprove={(role) => void review(req, "approved", role)}
                  onReject={() => void review(req, "rejected")}
                  extra={
                    <Link
                      to={`/app/projects/${encodeURIComponent(req.projectId)}/overview`}
                      className="inline-flex h-9 items-center px-2 text-[12.5px] text-[#A06358]"
                    >
                      打开项目 →
                    </Link>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </WorkspaceShell>
  );
}
