import { cn } from "@/lib/utils";
import { HeyuSelect } from "@/components/workspace/HeyuSelect";
import { roleLabelForProject } from "@/workspace/workspace-users";
import type { WorkspaceRole } from "@/workspace/types";

export const INVESTOR_PERMISSION_ROLES = ["low", "core", "admin"] as const;
export type InvestorPermissionRole = (typeof INVESTOR_PERMISSION_ROLES)[number];
export type AssignableMemberRole = InvestorPermissionRole | "issuer";

export function trackFromRole(role: WorkspaceRole): "investor" | "issuer" {
  return role === "issuer" ? "issuer" : "investor";
}

export function investorPermissionFromRole(
  role: WorkspaceRole,
): InvestorPermissionRole {
  if (role === "admin" || role === "core" || role === "low") return role;
  return "low";
}

export function assignableRoleFromTrack(
  track: "investor" | "issuer",
  investorRole: InvestorPermissionRole,
): AssignableMemberRole {
  return track === "issuer" ? "issuer" : investorRole;
}

export const ISSUER_TYPE_LABEL = "被投方";

function investorRoleOptions(current: WorkspaceRole): {
  value: InvestorPermissionRole | "mid";
  label: string;
}[] {
  const options: { value: InvestorPermissionRole | "mid"; label: string }[] =
    INVESTOR_PERMISSION_ROLES.map((r) => ({
      value: r,
      label: roleLabelForProject(r),
    }));
  if (current === "mid") {
    options.push({
      value: "mid",
      label: `${roleLabelForProject("mid")}（请改档）`,
    });
  }
  return options;
}

/** 管理端「项目权限」：身份 + 等级/类型 两个下拉 */
export function ProjectRoleSelects({
  role,
  disabled,
  onChange,
}: {
  role: WorkspaceRole;
  disabled?: boolean;
  onChange: (role: AssignableMemberRole) => void;
}) {
  const track = trackFromRole(role);
  const investorRole = investorPermissionFromRole(role);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <HeyuSelect
        size="sm"
        aria-label="身份"
        disabled={disabled}
        value={track}
        options={[
          { value: "investor", label: "投资方" },
          { value: "issuer", label: "项目协作方" },
        ]}
        onChange={(next) =>
          onChange(assignableRoleFromTrack(next, investorRole))
        }
      />
      {track === "issuer" ? (
        <span className="inline-flex h-7 items-center rounded-lg border border-[rgba(78,66,57,0.14)] bg-white px-2 text-[12px] text-[hsl(var(--warm-charcoal))]">
          {ISSUER_TYPE_LABEL}
        </span>
      ) : (
        <HeyuSelect
          size="sm"
          aria-label="等级"
          disabled={disabled}
          value={role === "mid" ? "mid" : investorRole}
          options={investorRoleOptions(role)}
          onChange={(next) => {
            if (next === "admin" || next === "core" || next === "low") {
              onChange(next);
            }
          }}
        />
      )}
    </div>
  );
}

type Props = {
  role: WorkspaceRole;
  disabled?: boolean;
  onChange: (role: AssignableMemberRole) => void;
  size?: "sm" | "md";
};

export function MemberRoleFields({
  role,
  disabled,
  onChange,
  size = "md",
}: Props) {
  const track = trackFromRole(role);
  const investorRole = investorPermissionFromRole(role);
  const compact = size === "sm";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className={cn(
          compact ? "heyu-segment heyu-segment-sm" : "heyu-segment",
          disabled && "opacity-70",
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (track === "investor") return;
            onChange(assignableRoleFromTrack("investor", investorRole));
          }}
          className={cn(
            "heyu-segment-item disabled:cursor-not-allowed",
            track === "investor" && "heyu-segment-item-on",
          )}
        >
          投资方
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (track === "issuer") return;
            onChange("issuer");
          }}
          className={cn(
            "heyu-segment-item disabled:cursor-not-allowed",
            track === "issuer" && "heyu-segment-item-on",
          )}
        >
          项目协作方
        </button>
      </div>
      {track === "investor" ? (
        <HeyuSelect
          prefix="权限"
          size={compact ? "sm" : "md"}
          aria-label="权限"
          disabled={disabled}
          value={role === "mid" ? "mid" : investorRole}
          options={investorRoleOptions(role)}
          onChange={(next) => {
            if (next === "admin" || next === "core" || next === "low") {
              onChange(next);
            }
          }}
        />
      ) : (
        <div
          className={cn(
            "heyu-chip gap-1.5",
            compact && "heyu-chip-sm",
            disabled && "opacity-70",
          )}
        >
          <span className="text-[11px] text-[hsl(var(--warm-charcoal-muted))]">
            类型
          </span>
          <span className="text-[13px] font-medium text-[hsl(var(--warm-charcoal))]">
            {ISSUER_TYPE_LABEL}
          </span>
        </div>
      )}
    </div>
  );
}
