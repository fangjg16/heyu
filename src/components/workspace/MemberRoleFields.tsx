import { cn } from "@/lib/utils";
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
          "inline-flex rounded-lg border border-[rgba(78,66,57,0.16)] bg-[rgba(255,252,248,0.9)] p-0.5",
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
            "rounded-md px-2.5 text-[12px] transition-colors disabled:cursor-not-allowed",
            compact ? "h-7" : "h-8",
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
          onClick={() => {
            if (track === "issuer") return;
            onChange("issuer");
          }}
          className={cn(
            "rounded-md px-2.5 text-[12px] transition-colors disabled:cursor-not-allowed",
            compact ? "h-7" : "h-8",
            track === "issuer"
              ? "bg-[hsl(var(--wine-muted))] font-medium text-[hsl(var(--wine))]"
              : "text-[hsl(var(--warm-charcoal-muted))] hover:bg-[rgba(78,66,57,0.05)]",
          )}
        >
          项目方
        </button>
      </div>
      {track === "investor" ? (
        <label
          className={cn(
            "flex items-center rounded-lg border border-[rgba(78,66,57,0.16)] bg-[rgba(255,252,248,0.9)] px-2",
            compact ? "h-7" : "h-8",
            disabled && "opacity-70",
          )}
        >
          <span className="mr-1.5 text-[11px] text-[hsl(var(--warm-charcoal-muted))]">
            权限
          </span>
          <select
            disabled={disabled}
            value={role === "mid" ? "mid" : investorRole}
            onChange={(e) => {
              const next = e.target.value;
              if (
                next === "admin" ||
                next === "core" ||
                next === "low"
              ) {
                onChange(next);
              }
            }}
            className="bg-transparent text-[12px] text-[hsl(var(--warm-charcoal))] outline-none disabled:cursor-not-allowed"
          >
            {INVESTOR_PERMISSION_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabelForProject(r)}
              </option>
            ))}
            {role === "mid" ? (
              <option value="mid">{roleLabelForProject("mid")}（请改档）</option>
            ) : null}
          </select>
        </label>
      ) : null}
    </div>
  );
}
