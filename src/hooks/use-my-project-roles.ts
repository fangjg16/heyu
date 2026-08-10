import { useEffect, useState } from "react";
import { ENABLE_LIVE_CHAT, fetchMyProjectRoles } from "@/lib/project-api";
import {
  clearMyProjectRoles,
  setMyProjectRoles,
  subscribeProjectRoles,
} from "@/workspace/project-role-cache";

/** 登录后 / 回到前台时同步角色，并在缓存更新时触发重渲染 */
export function useMyProjectRoles(userId: string | null): number {
  const [rolesVersion, setRolesVersion] = useState(0);

  useEffect(() => {
    return subscribeProjectRoles(() => {
      setRolesVersion((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    if (!userId) {
      clearMyProjectRoles();
      return;
    }
    if (!ENABLE_LIVE_CHAT) return;

    let cancelled = false;

    const refresh = () => {
      void fetchMyProjectRoles(userId)
        .then((roles) => {
          if (!cancelled) setMyProjectRoles(roles);
        })
        .catch(() => {
          if (!cancelled) clearMyProjectRoles();
        });
    };

    refresh();

    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId]);

  return rolesVersion;
}
