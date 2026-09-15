export type BreadcrumbItem = {
  label: string;
  to?: string;
  current?: boolean;
};

/** 名称未到、或接口把 id 当成了名称时，不要把 proj-* 画进面包屑。 */
export function looksLikeProjectId(value?: string): boolean {
  const v = (value ?? "").trim();
  return /^proj-[a-z0-9]+$/i.test(v);
}

export function projectCrumbLabel(
  projectName?: string,
  projectId?: string,
): string {
  const name = projectName?.trim();
  if (!name || looksLikeProjectId(name) || (projectId && name === projectId)) {
    return "项目";
  }
  return name;
}

export function workspaceBreadcrumbs(input: {
  pathname: string;
  projectId?: string;
  projectName?: string;
}): BreadcrumbItem[] {
  const { pathname, projectId, projectName } = input;
  const projectLabel = projectCrumbLabel(projectName, projectId);

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
          label: projectLabel,
          to: `/app/projects/${projectId}/overview`,
        },
        { label: "AI 分析与对话", current: true },
      ];
    }
    return [{ label: "对话", current: true }];
  }
  if (pathname.startsWith("/app/projects/")) {
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
