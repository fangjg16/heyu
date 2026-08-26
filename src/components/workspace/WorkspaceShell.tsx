import type { ReactNode } from "react";
import { WorkspaceLeftRail } from "@/components/workspace/WorkspaceLeftRail";
import { WorkspaceTopBar } from "@/components/workspace/WorkspaceTopBar";
import { cn } from "@/lib/utils";

export function WorkspaceShell({
  children,
  contentClassName,
  shellClassName,
  hideTopBar = false,
  fillHeight = false,
}: {
  children: ReactNode;
  contentClassName?: string;
  shellClassName?: string;
  /** 对话等全屏页可隐藏顶栏下方的默认内边距滚动区 */
  hideTopBar?: boolean;
  fillHeight?: boolean;
}) {
  return (
    <div
      className={cn(
        "workspace-paper-bg flex h-[100dvh] min-h-0 overflow-hidden",
        shellClassName
      )}
    >
      <WorkspaceLeftRail />
      <div className="flex min-w-0 flex-1 flex-col">
        {hideTopBar ? null : <WorkspaceTopBar />}
        <div
          className={cn(
            "workspace-paper-content relative z-[1] min-h-0 flex-1",
            fillHeight
              ? "flex h-full min-h-0 flex-col overflow-hidden"
              : "overflow-y-auto",
            contentClassName
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
