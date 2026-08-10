import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { fetchAuthMe, fetchWorkspaceUsersDirectory } from "@/lib/api-auth";
import { loadSessionToken, loadSessionUserId } from "@/workspace/session";

export default function RequireAuth() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const userId = loadSessionUserId();
      const token = loadSessionToken();
      if (!userId || !token) {
        navigate("/app/login", { replace: true });
        return;
      }
      try {
        const me = await fetchAuthMe();
        if (cancelled) return;
        if (!me) {
          navigate("/app/login", { replace: true });
          return;
        }
        try {
          await fetchWorkspaceUsersDirectory();
        } catch {
          /* ignore */
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) navigate("/app/login", { replace: true });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        校验登录…
      </div>
    );
  }

  return <Outlet />;
}
