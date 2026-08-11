import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Bell, LogOut, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutRemote } from "@/lib/api-auth";
import { getMergedProjects } from "@/workspace/project-registry";
import { clearSession, loadSessionUserId } from "@/workspace/session";
import { getUserById } from "@/workspace/workspace-users";

export type BreadcrumbItem = {
  label: string;
  to?: string;
  current?: boolean;
};

function initialsFromDisplayName(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw) return "?";
  const withSpaces = raw.replace(/([a-z])([A-Z])/g, "$1 $2");
  const tokens = withSpaces
    .split(/[\s-]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) {
    const token = tokens[0];
    const picked = `${token[0] ?? ""}${token[1] ?? ""}`.trim();
    return picked ? picked.toUpperCase() : "?";
  }
  return `${tokens[0][0] ?? ""}${tokens[1][0] ?? ""}`.toUpperCase();
}

function useBreadcrumbs(): BreadcrumbItem[] {
  const { pathname } = useLocation();
  const params = useParams();

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
    const projectId = params.projectId;
    if (projectId) {
      const project = getMergedProjects().find((p) => p.id === projectId);
      return [
        { label: "项目库", to: "/app/projects" },
        {
          label: project?.name ?? projectId,
          to: `/app/projects/${projectId}/overview`,
        },
        { label: "AI 分析与对话", current: true },
      ];
    }
    return [{ label: "对话", current: true }];
  }
  if (pathname.startsWith("/app/projects/")) {
    const projectId = params.projectId;
    const project = projectId
      ? getMergedProjects().find((p) => p.id === projectId)
      : undefined;
    return [
      { label: "项目库", to: "/app/projects" },
      { label: project?.name ?? projectId ?? "项目", current: true },
    ];
  }
  if (pathname.startsWith("/app/projects")) {
    return [{ label: "项目库", current: true }];
  }
  return [{ label: "工作台", current: true }];
}

function isProjectLibraryPath(pathname: string): boolean {
  return pathname === "/app/projects" || pathname === "/app/projects/";
}

export function WorkspaceTopBar({
  searchPlaceholder = "搜索项目、资料、团队或内容",
}: {
  searchPlaceholder?: string;
}) {
  const crumbs = useBreadcrumbs();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = loadSessionUserId();
  const user = getUserById(userId);
  const userInitial = initialsFromDisplayName(user?.displayName);
  const notifActive = pathname.startsWith("/app/notifications");
  const onLibrary = isProjectLibraryPath(pathname);

  const urlQuery = onLibrary ? (searchParams.get("q") ?? "") : "";
  const [query, setQuery] = useState(urlQuery);
  const [menuOpen, setMenuOpen] = useState(false);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({
    top: 0,
    right: 0,
  });

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery, pathname]);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    const btn = avatarBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (avatarBtnRef.current?.contains(t)) return;
      if (menuPanelRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onResize = () => setMenuOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  const applyProjectSearch = (raw: string) => {
    const q = raw.trim();
    if (onLibrary) {
      const next = new URLSearchParams(searchParams);
      if (q) next.set("q", q);
      else next.delete("q");
      setSearchParams(next, { replace: true });
      return;
    }
    navigate(q ? `/app/projects?q=${encodeURIComponent(q)}` : "/app/projects");
  };

  const logout = () => {
    setMenuOpen(false);
    clearSession();
    void logoutRemote();
    // 硬跳转，避免嵌套路由 / 登录页 effect 竞态
    window.location.assign(`${import.meta.env.BASE_URL}app/login`);
  };

  return (
    <header className="relative z-30 flex h-[72px] shrink-0 items-center gap-5 border-b border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.55)] px-8 backdrop-blur-[18px]">
      <nav
        className="flex items-center gap-2.5 text-[15px] text-[hsl(var(--warm-charcoal-muted))]"
        aria-label="面包屑"
      >
        <Link
          to="/app/home"
          className="transition-colors hover:text-[hsl(var(--wine))]"
        >
          合域
        </Link>
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="flex items-center gap-2">
            <span>/</span>
            {c.to && !c.current ? (
              <Link
                to={c.to}
                className="transition-colors hover:text-[hsl(var(--wine))]"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={cn(
                  c.current
                    ? "text-[hsl(var(--warm-charcoal))]"
                    : "text-[hsl(var(--warm-charcoal-muted))]",
                )}
              >
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      <form
        className="flex h-11 w-[380px] max-w-[34vw] items-center gap-2.5 rounded-xl border border-[rgba(78,66,57,0.14)] bg-[rgba(255,252,248,0.8)] px-4 text-[hsl(var(--warm-charcoal-muted))]"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          applyProjectSearch(query);
        }}
      >
        <Search className="h-[18px] w-[18px] shrink-0 opacity-70" strokeWidth={2} />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            if (onLibrary) applyProjectSearch(next);
          }}
          placeholder={
            onLibrary ? "搜索项目名称、分类、负责人…" : searchPlaceholder
          }
          aria-label="搜索项目库"
          className="w-full bg-transparent text-sm text-[hsl(var(--warm-charcoal))] placeholder:text-[hsl(var(--warm-charcoal-muted)/0.75)] focus:outline-none"
        />
      </form>

      <Link
        to="/app/notifications"
        className={cn(
          "relative text-[hsl(var(--warm-charcoal-muted))] transition-colors hover:text-[hsl(var(--wine))]",
          notifActive && "text-[hsl(var(--wine))]",
        )}
        aria-label="通知"
      >
        <Bell className="h-[22px] w-[22px]" strokeWidth={1.8} />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-[1.5px] border-[hsl(var(--paper))] bg-[hsl(var(--wine))]" />
      </Link>

      <div className="relative">
        <button
          ref={avatarBtnRef}
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="用户菜单"
          title={user?.displayName ?? "用户"}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--wine-deep))] text-[13px] font-bold text-white transition-opacity hover:opacity-90"
        >
          {userInitial}
        </button>
      </div>

      {menuOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuPanelRef}
              role="menu"
              style={{ top: menuPos.top, right: menuPos.right }}
              className="fixed z-[300] min-w-[160px] overflow-hidden rounded-xl border border-[rgba(78,66,57,0.12)] bg-white py-1.5 shadow-[0_12px_32px_rgba(102,80,60,0.16)]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  logout();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[#1F2423] transition-colors hover:bg-[rgba(202,33,55,0.06)] hover:text-[#CA2137]"
              >
                <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                退出登录
              </button>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}
