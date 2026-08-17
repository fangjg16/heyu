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
    <div className="mt-3 flex flex-col gap-2.5">
      <MemberRoleFields
        role={role}
        disabled={disabled}
        onChange={setRole}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onApprove(role)}
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
