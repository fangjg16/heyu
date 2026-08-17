import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AdminApiProbeSection } from "@/components/workspace/AdminApiProbeSection";
import { AdminDraftsSection } from "@/components/workspace/AdminDraftsSection";
import { AdminKnTemplatesSection } from "@/components/workspace/AdminKnTemplatesSection";
import { AdminLlmSettingsSection } from "@/components/workspace/AdminLlmSettingsSection";
import { AdminOperationLogsSection } from "@/components/workspace/AdminOperationLogsSection";
import { AdminReviseLogsSection } from "@/components/workspace/AdminReviseLogsSection";
import { AdminSkillsSection } from "@/components/workspace/AdminSkillsSection";
import { AdminUsersSection } from "@/components/workspace/AdminUsersSection";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { loadSessionUserId } from "@/workspace/session";
import { isPlatformAdminUser } from "@/workspace/workspace-users";

const ADMIN_TABS: { id: string; label: string; to: string }[] = [
  { id: "users", label: "用户与权限", to: "/app/admin/users" },
  { id: "skills", label: "Hermes Skills", to: "/app/admin/skills" },
  { id: "kn-templates", label: "知识网络 MD", to: "/app/admin/kn-templates" },
  { id: "llm", label: "模型与密钥", to: "/app/admin/llm" },
  { id: "api-probe", label: "API 测试", to: "/app/admin/api-probe" },
  { id: "audit", label: "操作日志", to: "/app/admin/audit" },
  { id: "drafts", label: "审核", to: "/app/admin/drafts" },
  { id: "revise-logs", label: "改写指令", to: "/app/admin/revise-logs" },
];

function activeAdminTab(pathname: string): string {
  if (pathname.includes("/admin/skills")) return "skills";
  if (pathname.includes("/admin/kn-templates")) return "kn-templates";
  if (pathname.includes("/admin/llm")) return "llm";
  if (pathname.includes("/admin/api-probe")) return "api-probe";
  if (pathname.includes("/admin/audit")) return "audit";
  if (pathname.includes("/admin/drafts")) return "drafts";
  if (pathname.includes("/admin/revise-logs")) return "revise-logs";
  return "users";
}

function useAdminGate(): { userId: string; allowed: boolean } {
  const userId = loadSessionUserId() ?? "";
  return { userId, allowed: isPlatformAdminUser(userId) };
}

export default function AdminPortal() {
  const { userId, allowed } = useAdminGate();
  const { pathname } = useLocation();
  const tab = activeAdminTab(pathname);

  return (
    <WorkspaceShell>
      <div className="mx-auto w-full max-w-[1200px] px-8 py-8 md:px-10">
        <h1 className="font-display text-[32px] font-semibold tracking-wide">
          系统管理
        </h1>

        {allowed ? (
          <>
            <div className="mt-6 flex flex-wrap items-end gap-1 border-b border-[rgba(78,66,57,0.12)]">
              {ADMIN_TABS.map((t) => (
                <Link
                  key={t.id}
                  to={t.to}
                  className={cn(
                    "mb-[-1px] inline-flex h-[42px] items-end px-4 pb-2.5 text-sm leading-none transition-colors",
                    tab === t.id
                      ? "border-b-2 border-[hsl(var(--wine))] font-semibold text-[hsl(var(--wine))]"
                      : "border-b-2 border-transparent font-normal text-[hsl(var(--warm-charcoal-muted))] hover:text-[hsl(var(--warm-charcoal))]",
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </div>

            <div className="mt-6">
              <Outlet context={{ selfUserId: userId }} />
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-[18px] border border-destructive/25 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            当前账号无权限访问系统管理。
          </div>
        )}

        <div className="mt-10">
          <Link
            to="/app/home"
            className="inline-flex h-10 items-center rounded-xl bg-[hsl(var(--wine))] px-5 text-sm font-medium text-white hover:bg-[hsl(var(--wine-hover))]"
          >
            返回总览
          </Link>
        </div>
      </div>
    </WorkspaceShell>
  );
}

export function AdminUsersTab() {
  const { userId, allowed } = useAdminGate();
  if (!allowed) return <Navigate to="/app/admin" replace />;
  return <AdminUsersSection selfUserId={userId} />;
}

export function AdminSkillsTab() {
  const { allowed } = useAdminGate();
  if (!allowed) return <Navigate to="/app/admin" replace />;
  return <AdminSkillsSection />;
}

export function AdminKnTemplatesTab() {
  const { allowed } = useAdminGate();
  if (!allowed) return <Navigate to="/app/admin" replace />;
  return <AdminKnTemplatesSection />;
}

export function AdminLlmSettingsTab() {
  const { allowed } = useAdminGate();
  if (!allowed) return <Navigate to="/app/admin" replace />;
  return <AdminLlmSettingsSection />;
}

export function AdminApiProbeTab() {
  const { allowed } = useAdminGate();
  if (!allowed) return <Navigate to="/app/admin" replace />;
  return <AdminApiProbeSection />;
}

export function AdminAuditTab() {
  const { userId, allowed } = useAdminGate();
  if (!allowed) return <Navigate to="/app/admin" replace />;
  return <AdminOperationLogsSection userId={userId} />;
}

export function AdminDraftsTab() {
  const { userId, allowed } = useAdminGate();
  if (!allowed) return <Navigate to="/app/admin" replace />;
  return <AdminDraftsSection userId={userId} />;
}

export function AdminReviseLogsTab() {
  const { userId, allowed } = useAdminGate();
  if (!allowed) return <Navigate to="/app/admin" replace />;
  return <AdminReviseLogsSection userId={userId} />;
}
