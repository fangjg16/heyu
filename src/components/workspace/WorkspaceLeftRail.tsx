import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Briefcase,
  Home,
  MessageSquare,
  PanelLeftClose,
  Settings,
} from "lucide-react";
import { BrandMark } from "@/components/workspace/BrandMark";
import { cn } from "@/lib/utils";
import { useMyProjectRoles } from "@/hooks/use-my-project-roles";
import { loadSessionUserId } from "@/workspace/session";
import {
  canOpenWorkspaceChat,
  isIssuerOnlyUser,
  isPlatformAdminUser,
} from "@/workspace/workspace-users";

const PIN_KEY = "hy-workspace-rail-pinned";

type NavItem = {
  key: string;
  label: string;
  to?: string;
  icon: typeof Home;
  active: boolean;
  onClick?: () => void;
};

export function WorkspaceLeftRail() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const userId = loadSessionUserId();
  useMyProjectRoles(userId);
  const isAdmin = isPlatformAdminUser(userId);
  const issuerOnly = isIssuerOnlyUser(userId);

  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem(PIN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [guestDialog, setGuestDialog] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(PIN_KEY, pinned ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [pinned]);

  const togglePinned = () => setPinned((v) => !v);

  const goChat = () => {
    if (!canOpenWorkspaceChat(userId)) {
      setGuestDialog(true);
      return;
    }
    navigate("/app/chat");
  };

  const topNav: NavItem[] = [
    {
      key: "home",
      label: "总览",
      to: "/app/home",
      icon: Home,
      active: pathname.startsWith("/app/home"),
    },
    {
      key: "lib",
      label: "项目库",
      to: "/app/projects",
      icon: Briefcase,
      active:
        pathname.startsWith("/app/projects") ||
        pathname.startsWith("/app/collab"),
    },
    ...(issuerOnly
      ? []
      : [
          {
            key: "chat",
            label: "对话",
            icon: MessageSquare,
            active: pathname.startsWith("/app/chat"),
            onClick: goChat,
          } satisfies NavItem,
        ]),
  ];

  const bottomNav: NavItem[] = isAdmin
    ? [
        {
          key: "admin",
          label: "系统管理",
          to: "/app/admin",
          icon: Settings,
          active:
            pathname.startsWith("/app/admin") ||
            pathname.startsWith("/app/settings"),
        },
      ]
    : [];

  const renderItem = (nav: NavItem) => {
    const Icon = nav.icon;
    const className = cn(
      "relative flex h-[52px] w-full items-center gap-[14px] rounded-xl px-3 text-left text-[15px] transition-colors",
      nav.active
        ? "bg-[hsl(var(--wine-muted))] font-semibold text-[hsl(var(--wine))]"
        : "bg-transparent font-normal text-[hsl(var(--warm-charcoal-muted))] hover:bg-[hsl(var(--wine)/0.07)]"
    );
    const body = (
      <>
        <span
          className={cn(
            "absolute bottom-3.5 left-[-6px] top-3.5 w-[3px] rounded-r-[3px]",
            nav.active ? "bg-[hsl(var(--wine))]" : "bg-transparent"
          )}
        />
        <span className="flex w-6 shrink-0 justify-center">
          <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} />
        </span>
        {pinned ? <span className="truncate">{nav.label}</span> : null}
      </>
    );

    return (
      <div key={nav.key} className="hy-nav-item">
        {nav.onClick ? (
          <button type="button" onClick={nav.onClick} className={className}>
            {body}
          </button>
        ) : (
          <Link to={nav.to!} className={className}>
            {body}
          </Link>
        )}
        {!pinned ? (
          <div className="hy-nav-tip rounded-[9px] bg-[hsl(var(--warm-charcoal))] px-[13px] py-[7px] text-[12.5px] text-white shadow-[0_8px_22px_rgba(31,36,35,0.3)]">
            {nav.label}
            <span className="absolute left-[-4px] top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-[hsl(var(--warm-charcoal))]" />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <aside
        className={cn(
          "relative z-40 flex h-full shrink-0 flex-col border-r border-[rgba(78,66,57,0.1)] bg-[rgba(248,243,238,0.96)] backdrop-blur-[18px] transition-[width] duration-200 ease-out",
          pinned ? "w-[240px]" : "w-20"
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-2",
            pinned ? "h-[72px] px-3" : "flex-col justify-center px-2 py-3",
          )}
        >
          <Link
            to="/app/home"
            title="总览"
            className="flex min-w-0 items-center gap-3"
          >
            <BrandMark className="h-9 w-9 shrink-0" />
            {pinned ? (
              <span className="truncate font-display text-[19px] font-bold">
                合域 AI
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            title={pinned ? "收起导航" : "展开导航"}
            onClick={togglePinned}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[hsl(var(--warm-charcoal-muted))] transition-colors hover:bg-[hsl(var(--wine)/0.08)] hover:text-[hsl(var(--wine))]",
              pinned ? "ml-auto" : "mt-1",
            )}
          >
            <PanelLeftClose
              className={cn(
                "h-[18px] w-[18px]",
                !pinned && "-scale-x-100",
              )}
              strokeWidth={1.8}
            />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[3px] px-[14px] py-2.5">
          {topNav.map(renderItem)}
          <div className="flex-1" />
          {bottomNav.length > 0 ? (
            <>
              <div className="mx-0.5 my-1.5 h-px bg-[rgba(78,66,57,0.08)]" />
              {bottomNav.map(renderItem)}
            </>
          ) : null}
        </div>
      </aside>

      {guestDialog ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guest-dialog-title"
        >
          <div className="w-full max-w-sm rounded-[14px] border border-[rgba(78,66,57,0.12)] bg-[hsl(var(--paper))] p-6 shadow-2xl">
            <h2
              id="guest-dialog-title"
              className="text-base font-bold text-foreground"
            >
              无法进入对话
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {issuerOnly
                ? "项目协作方工作台不包含投资团队对话。请在协作事项中答复。"
                : "当前还没有可进入对话的投资项目。被加入项目投资团队后即可使用对话中心。"}
            </p>
            <button
              type="button"
              onClick={() => setGuestDialog(false)}
              className="mt-5 w-full rounded-xl bg-[hsl(var(--wine))] py-2.5 text-sm font-semibold text-white hover:bg-[hsl(var(--wine-hover))]"
            >
              知道了
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
