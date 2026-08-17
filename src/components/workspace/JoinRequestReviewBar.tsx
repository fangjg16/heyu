import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { JoinApproveRole } from "@/lib/project-api";
import { roleLabelForProject } from "@/workspace/workspace-users";

const INVESTOR_ROLES = ["low", "core", "admin"] as const;

type JoinTrack = "investor" | "issuer";

type Props = {
  disabled?: boolean;
  approveClassName?: string;
  onApprove: (role: JoinApproveRole) => void;
  onReject: () => void;
  extra?: ReactNode;
};

export function JoinRequestReviewBar({
  disabled,
  approveClassName,
  onApprove,
  onReject,
  extra,
}: Props) {
  const [track, setTrack] = useState<JoinTrack>("investor");
  const [investorRole, setInvestorRole] =
    useState<(typeof INVESTOR_ROLES)[number]>("low");

  const approve = () => {
    onApprove(track === "issuer" ? "issuer" : investorRole);
  };

  return (
    <div className="mt-3 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[hsl(var(--warm-charcoal-muted))]">
          加入身份
        </span>
        <div className="inline-flex rounded-lg border border-[rgba(78,66,57,0.16)] bg-[rgba(255,252,248,0.9)] p-0.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setTrack("investor")}
            className={cn(
              "h-7 rounded-md px-2.5 text-[12px] transition-colors disabled:opacity-50",
              track === "investor"
                ? "bg-[hsl(var(--wine-muted))] font-medium text-[hsl(var(--wine))]"
                : "text-[hsl(var(--warm-charcoal-muted))] hover:bg-[rgba(78,66,57,0.05)]",
            )}
          >
            投资方
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setTrack("issuer")}
            className={cn(
              "h-7 rounded-md px-2.5 text-[12px] transition-colors disabled:opacity-50",
              track === "issuer"
                ? "bg-[hsl(var(--wine-muted))] font-medium text-[hsl(var(--wine))]"
                : "text-[hsl(var(--warm-charcoal-muted))] hover:bg-[rgba(78,66,57,0.05)]",
            )}
          >
            项目方
          </button>
        </div>
        {track === "investor" ? (
          <>
            <span className="text-[12px] text-[hsl(var(--warm-charcoal-muted))]">
              权限
            </span>
            <label className="flex h-7 items-center rounded-lg border border-[rgba(78,66,57,0.16)] bg-[rgba(255,252,248,0.9)] px-2">
              <select
                disabled={disabled}
                value={investorRole}
                onChange={(e) =>
                  setInvestorRole(
                    e.target.value as (typeof INVESTOR_ROLES)[number],
                  )
                }
                className="bg-transparent text-[12px] text-[hsl(var(--warm-charcoal))] outline-none disabled:opacity-50"
              >
                {INVESTOR_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {roleLabelForProject(role)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <span className="text-[12px] text-[hsl(var(--warm-charcoal-muted))]">
            项目方不设投资权限档
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={approve}
          className={cn(
            "h-9 rounded-lg px-3 text-[12.5px] font-medium text-white disabled:opacity-50",
            approveClassName ?? "bg-[#5E9B75]",
          )}
        >
          通过
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onReject}
          className="h-9 rounded-lg border border-[rgba(160,99,88,0.3)] px-3 text-[12.5px] text-[#A06358] disabled:opacity-50"
        >
          拒绝
        </button>
        {extra}
      </div>
    </div>
  );
}
