import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { JoinApproveRole } from "@/lib/project-api";
import { MemberRoleFields } from "@/components/workspace/MemberRoleFields";

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
  const [role, setRole] = useState<JoinApproveRole>("low");

  return (
    <div className="mt-3.5">
      <MemberRoleFields
        role={role}
        disabled={disabled}
        onChange={setRole}
      />
      <div className="mt-3.5 flex items-center gap-1 border-t border-[rgba(78,66,57,0.08)] pt-3">
        {extra}
        <div className="flex-1" />
        <button
          type="button"
          disabled={disabled}
          onClick={onReject}
          className="inline-flex h-8 items-center rounded-[9px] px-3 text-[13px] text-[hsl(var(--warm-charcoal-muted))] transition-colors hover:bg-[rgba(78,66,57,0.06)] hover:text-[#A06358] disabled:opacity-50"
        >
          拒绝
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onApprove(role)}
          className={cn(
            "heyu-control min-w-[72px] px-[18px] text-[13px] font-medium text-white disabled:opacity-50",
            approveClassName ??
              "bg-[hsl(var(--wine))] hover:bg-[hsl(var(--wine-hover))]",
          )}
        >
          通过
        </button>
      </div>
    </div>
  );
}
