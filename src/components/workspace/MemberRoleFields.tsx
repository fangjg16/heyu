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

export const ISSUER_TYPE_LABEL = "被投方";

const pairSelectClass =
  "shrink-0 rounded border border-border/70 bg-white px-1.5 py-1 text-[10px] text-foreground outline-none disabled:cursor-not-allowed";

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
      <select
        value={track}
        disabled={disabled}
        aria-label="身份"
        onChange={(e) => {
          const next = e.target.value === "issuer" ? "issuer" : "investor";
          onChange(assignableRoleFromTrack(next, investorRole));
        }}
        className={cn(pairSelectClass, "w-[6.75rem]")}
      >
        <option value="investor">投资方</option>
        <option value="issuer">项目协作方</option>
      </select>
      {track === "issuer" ? (
        <select
          value="issuer"
          disabled={disabled}
          aria-label="类型"
          className={cn(pairSelectClass, "w-[5.25rem]")}
        >
          <option value="issuer">{ISSUER_TYPE_LABEL}</option>
        </select>
      ) : (
        <select
          value={role === "mid" ? "mid" : investorRole}
          disabled={disabled}
          aria-label="等级"
          onChange={(e) => {
            const next = e.target.value;
            if (next === "admin" || next === "core" || next === "low") {
              onChange(next);
            }
          }}
          className={cn(pairSelectClass, "w-[8.75rem]")}
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
        <label
          className={cn(
            "heyu-chip gap-1.5",
            compact && "heyu-chip-sm",
            disabled && "opacity-70",
          )}
        >
          <span className="text-[11px] text-[hsl(var(--warm-charcoal-muted))]">
            权限
          </span>
          <select
            disabled={disabled}
            value={role === "mid" ? "mid" : investorRole}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "admin" || next === "core" || next === "low") {
                onChange(next);
              }
            }}
            className="heyu-select text-[13px] text-[hsl(var(--warm-charcoal))] outline-none disabled:cursor-not-allowed"
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
      ) : (
        <label
          className={cn(
            "heyu-chip gap-1.5",
            compact && "heyu-chip-sm",
            disabled && "opacity-70",
          )}
        >
          <span className="text-[11px] text-[hsl(var(--warm-charcoal-muted))]">
            类型
          </span>
          <select
            disabled={disabled}
            value="issuer"
            className="heyu-select text-[13px] text-[hsl(var(--warm-charcoal))] outline-none disabled:cursor-not-allowed"
          >
            <option value="issuer">{ISSUER_TYPE_LABEL}</option>
          </select>
        </label>
      )}
    </div>
  );
}
