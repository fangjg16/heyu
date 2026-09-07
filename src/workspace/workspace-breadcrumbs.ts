export type BreadcrumbItem = {
  label: string;
  to?: string;
  current?: boolean;
};

export function workspaceBreadcrumbs(input: {
  pathname: string;
  projectId?: string;
  projectName?: string;
}): BreadcrumbItem[] {
  const { pathname, projectId, projectName } = input;

  if (pathname.startsWith("/app/home")) {
    return [{ label: "总览", current: true }];
  }
  if (pathname.startsWith("/app/notifications")) {
    return [{ label: "通知", current: true }];
  }
  if (pathname.startsWith("/app/admin") || pathname.startsWith("/app/settings")) {
    return [{ label: "系统管理", current: true }];
  }
  if (pathname.startsWith("/app/chat")) {
    if (projectId) {
      return [
        { label: "项目库", to: "/app/projects" },
        {
          label: projectName ?? projectId,
          to: `/app/projects/${projectId}/overview`,
        },
        { label: "AI 分析与对话", current: true },
      ];
    }
    return [{ label: "对话", current: true }];
  }
  if (pathname.startsWith("/app/projects/")) {
    const projectLabel = projectName ?? projectId ?? "项目";
    if (projectId && /\/knowledge\/review(?:\/|$)/.test(pathname)) {
      return [
        { label: "项目库", to: "/app/projects" },
        {
          label: projectLabel,
          to: `/app/projects/${projectId}/knowledge`,
        },
        { label: "审核草案", current: true },
      ];
    }
    return [
      { label: "项目库", to: "/app/projects" },
      { label: projectLabel, current: true },
    ];
  }
  if (pathname.startsWith("/app/projects")) {
    return [{ label: "项目库", current: true }];
  }
  return [{ label: "工作台", current: true }];
}
