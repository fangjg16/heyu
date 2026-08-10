import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

export default function Notifications() {
  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-[880px] px-8 py-10 md:px-12">
        <h1 className="font-display text-[32px] font-semibold tracking-wide">
          通知
        </h1>
        <p className="mt-2 text-[hsl(var(--warm-charcoal-muted))]">
          正式推送服务接入前暂无通知数据。
        </p>

        <div className="mt-8 rounded-2xl border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.82)] px-6 py-10 text-center text-sm text-[hsl(var(--warm-charcoal-muted))]">
          —
        </div>
      </div>
    </WorkspaceShell>
  );
}
