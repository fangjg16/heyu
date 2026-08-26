import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/workspace/UserAvatar";
import { fetchAuthMe, patchMyProfile } from "@/lib/api-auth";
import { resizeImageToJpegDataUrl } from "@/lib/resize-avatar";
import {
  dismissIfBackdropClick,
  markBackdropPointerDown,
} from "@/lib/backdrop-dismiss";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import type { WorkspaceUser } from "@/workspace/types";

const inputClass =
  "mt-1 w-full rounded-lg border border-[hsl(var(--sand))] bg-white px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--wine-deep)/0.35)]";

export function ProfileDialog({
  open,
  user,
  onClose,
}: {
  open: boolean;
  user: WorkspaceUser | undefined;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setDisplayName(user?.displayName ?? "");
    setAvatarUrl(user?.avatarUrl ?? "");
    setUsername(user?.username ?? "");
    setError(null);
    void fetchAuthMe()
      .then((me) => {
        if (!me) return;
        setDisplayName(me.displayName);
        setAvatarUrl(me.avatarUrl ?? "");
        setUsername(me.username ?? "");
      })
      .catch(() => {
        /* 用本地缓存即可 */
      });
  }, [open, user?.id, user?.displayName, user?.avatarUrl, user?.username]);

  if (!open || typeof document === "undefined") return null;

  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setAvatarBusy(true);
    setError(null);
    try {
      setAvatarUrl(await resizeImageToJpegDataUrl(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onSave = async () => {
    const name = displayName.trim();
    if (!name) {
      setError("请填写昵称");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchMyProfile({
        displayName: name,
        avatarUrl,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-dialog-title"
      onPointerDown={markBackdropPointerDown}
      onClick={(e) => dismissIfBackdropClick(e, onClose, !saving)}
    >
      <div className="w-full max-w-md rounded-xl border border-[rgba(78,66,57,0.12)] bg-white p-5 shadow-2xl">
        <h2
          id="profile-dialog-title"
          className="font-display text-lg font-semibold text-foreground"
        >
          个人资料
        </h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          可修改昵称和头像。登录名在注册时确定，不能更改。
        </p>

        <div className="mt-4 space-y-3">
          <div className="block text-[11px] font-medium text-muted-foreground">
            头像
            <div className="mt-1 flex items-center gap-3">
              <UserAvatar
                user={{ displayName, avatarUrl }}
                className="h-14 w-14 text-sm"
                fallbackClassName="bg-[hsl(var(--wine-deep))] text-white"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onPickAvatar(e.target.files?.[0])}
                />
                <button
                  type="button"
                  disabled={saving || avatarBusy}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/40 disabled:opacity-50"
                >
                  {avatarBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  ) : (
                    <ImagePlus className="h-3 w-3" aria-hidden />
                  )}
                  更换头像
                </button>
                {avatarUrl ? (
                  <button
                    type="button"
                    disabled={saving || avatarBusy}
                    onClick={() => setAvatarUrl("")}
                    className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
                  >
                    移除
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <label className="block text-[11px] font-medium text-muted-foreground">
            昵称
            <input
              className={inputClass}
              value={displayName}
              maxLength={40}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>

          <label className="block text-[11px] font-medium text-muted-foreground">
            登录名
            <input
              className={`${inputClass} bg-muted/40 text-muted-foreground`}
              value={username || "—"}
              readOnly
              disabled
            />
            <span className="mt-1 block text-[11px] font-normal text-muted-foreground/80">
              注册时使用，邮箱登录时即为邮箱地址。
            </span>
          </label>

          {error ? (
            <p className="rounded-lg border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl border border-[rgba(78,66,57,0.16)] px-3.5 py-2 text-[13px] font-medium text-[hsl(var(--warm-charcoal-muted))] hover:bg-muted/40 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving || avatarBusy}
            onClick={() => void onSave()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[hsl(var(--wine))] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[hsl(var(--wine-hover))] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
