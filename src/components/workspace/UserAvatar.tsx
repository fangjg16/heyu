import { cn } from "@/lib/utils";

export function initialsFromDisplayName(name: string | null | undefined): string {
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

type AvatarUser = {
  displayName?: string | null;
  avatarUrl?: string | null;
  avatarClass?: string | null;
};

type UserAvatarProps = {
  user?: AvatarUser | null;
  className?: string;
  fallbackClassName?: string;
};

export function UserAvatar({
  user,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const url = (user?.avatarUrl ?? "").trim();
  const initial = initialsFromDisplayName(user?.displayName);
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={cn("h-full w-full rounded-full object-cover", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full text-xs font-semibold",
        fallbackClassName ??
          user?.avatarClass ??
          "bg-slate-300 text-slate-800",
        className,
      )}
    >
      {initial}
    </div>
  );
}
