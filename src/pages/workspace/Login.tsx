import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { loginWithPassword, fetchWorkspaceUsersDirectory } from "@/lib/api-auth";
import { loadSessionToken, loadSessionUserId } from "@/workspace/session";

const REMEMBER_USER_KEY = "fo-login-remember-user";

const DEMO_IDENTITIES = [
  { name: "BingheSu", role: "项目负责人", username: "binghesu" },
  { name: "JimmyHuang", role: "Core 核心级", username: "jimmyhuang" },
  { name: "管理员", role: "平台管理", username: "candiceguo" },
  { name: "访客", role: "Guest 浏览", username: "janicehi" },
] as const;

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromSwitch = searchParams.get("switch") === "1";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loadSessionUserId() && loadSessionToken()) {
      navigate("/app/home", { replace: true });
      return;
    }
    const remembered = localStorage.getItem(REMEMBER_USER_KEY);
    if (remembered) setUsername(remembered);
  }, [navigate]);

  const submit = (u: string, p: string) => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    void (async () => {
      try {
        await loginWithPassword(u, p);
        try {
          await fetchWorkspaceUsersDirectory();
        } catch {
          /* ignore */
        }
        localStorage.setItem(REMEMBER_USER_KEY, u.trim());
        navigate("/app/home", { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "账号或密码不正确，请核对后重试。");
        setSubmitting(false);
      }
    })();
  };

  const onSubmitForm = (e: FormEvent) => {
    e.preventDefault();
    submit(username, password);
  };

  return (
    <div className="login-page flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F6F3EE] font-sans text-[hsl(var(--warm-charcoal))]">
      <div className="flex min-h-0 flex-1">
        {/* Left brand panel */}
        <div className="relative hidden flex-[1.1] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#F2EBE3] via-[#F6F3EE] to-[#F0E7E3] px-[60px] py-14 lg:flex">
          <svg
            viewBox="0 0 600 700"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
            aria-hidden
          >
            <g stroke="rgba(160,99,88,0.16)" strokeWidth="1" fill="none">
              <path d="M80 120 L240 200 L180 360 L360 300 L480 420" />
              <path d="M240 200 L300 90 L460 160 L480 420 L520 560" />
              <path d="M180 360 L120 520 L320 560 L360 300" />
              <path d="M320 560 L480 600 L520 560" />
            </g>
            <g fill="rgba(160,99,88,0.5)">
              <circle cx="80" cy="120" r="3.5" />
              <circle cx="240" cy="200" r="4.5" />
              <circle cx="300" cy="90" r="3" />
              <circle cx="460" cy="160" r="3.5" />
              <circle cx="180" cy="360" r="4" />
              <circle cx="360" cy="300" r="5" />
              <circle cx="480" cy="420" r="3.5" />
              <circle cx="120" cy="520" r="3" />
              <circle cx="320" cy="560" r="4" />
              <circle cx="520" cy="560" r="3" />
              <circle cx="480" cy="600" r="3.5" />
            </g>
          </svg>

          <div className="relative flex items-center gap-3.5">
            <Link
              to="/"
              className="flex h-[46px] w-[46px] items-center justify-center rounded-[11px] bg-[hsl(var(--wine))] font-display text-[13px] font-bold tracking-wide text-white"
            >
              合域
            </Link>
            <div>
              <div className="font-display text-[22px] font-bold tracking-wide">
                合域 AI
              </div>
              <div className="text-xs tracking-[2px] text-[hsl(var(--warm-charcoal-muted))]">
                JOINT OFFICE AI
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="font-display text-[40px] font-bold leading-[1.3] tracking-wide">
              为多个家族共同投资，
              <br />
              建立一套可信的 AI 决策工作台
            </div>
            <div className="mt-5 max-w-[440px] text-[15px] leading-[1.9] text-[hsl(var(--warm-charcoal-muted))]">
              把项目资料、AI 分析、家族协同、IC 决议和签约方案，串成一条可审计的清晰流程。
            </div>
          </div>

          <div className="relative flex gap-7 text-[12.5px] text-[hsl(var(--warm-charcoal-muted))]">
            <span>全链路权限隔离</span>
            <span>·</span>
            <span>事实 / 证据 / 缺口可追溯</span>
            <span>·</span>
            <span>联合投资流程闭环</span>
          </div>
        </div>

        {/* Right form */}
        <div className="flex flex-[0.9] items-center justify-center bg-[#F6F3EE] px-6">
          <div className="w-[420px] max-w-[88%]">
            <div className="mb-4 lg:hidden">
              <Link
                to="/"
                className="font-display text-lg font-bold text-[hsl(var(--wine))]"
              >
                合域 AI
              </Link>
            </div>
            <h1 className="font-display text-[28px] font-semibold">登录工作台</h1>
            <p className="mt-2 text-[13.5px] text-[hsl(var(--warm-charcoal-muted))]">
              内部用户登录，或选择演示身份预填账号后输入密码进入。
            </p>
            {fromSwitch ? (
              <p className="mt-3 rounded-xl border border-[hsl(var(--wine)/0.22)] bg-[hsl(var(--wine-muted))] px-3.5 py-2.5 text-xs text-[hsl(var(--warm-charcoal))]">
                已退出当前会话，请重新输入账号与密码。
              </p>
            ) : null}

            <form onSubmit={onSubmitForm} className="mt-[30px] flex flex-col gap-3.5">
              <div>
                <div className="mb-1.5 text-[12.5px] text-[hsl(var(--warm-charcoal-muted))]">
                  用户名
                </div>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={submitting}
                  className="h-11 w-full rounded-xl border border-[hsl(var(--wine)/0.16)] bg-[rgba(255,252,248,0.9)] px-4 text-sm text-[hsl(var(--warm-charcoal))] outline-none focus:border-[hsl(var(--wine)/0.4)]"
                  placeholder="账号或邮箱"
                />
              </div>
              <div>
                <div className="mb-1.5 text-[12.5px] text-[hsl(var(--warm-charcoal-muted))]">
                  密码
                </div>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="h-11 w-full rounded-xl border border-[hsl(var(--wine)/0.16)] bg-[rgba(255,252,248,0.9)] px-4 text-sm outline-none focus:border-[hsl(var(--wine)/0.4)]"
                  placeholder="请输入密码"
                />
              </div>
              {error ? (
                <p className="rounded-xl border border-[hsl(var(--wine)/0.28)] bg-[hsl(var(--wine-muted))] px-3 py-2.5 text-sm">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={submitting}
                className="mt-1.5 h-[46px] rounded-xl bg-[hsl(var(--wine))] text-[15px] font-medium text-white transition-colors hover:bg-[hsl(var(--wine-hover))] disabled:opacity-60"
              >
                {submitting ? "登录中..." : "登录"}
              </button>
            </form>

            <div className="mt-[30px]">
              <div className="flex items-center gap-3 text-xs text-[hsl(var(--warm-charcoal-muted))]">
                <div className="h-px flex-1 bg-[rgba(78,66,57,0.12)]" />
                演示身份
                <div className="h-px flex-1 bg-[rgba(78,66,57,0.12)]" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {DEMO_IDENTITIES.map((id) => (
                  <button
                    key={id.username}
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setUsername(id.username);
                      setError(null);
                    }}
                    className="rounded-xl border border-[rgba(78,66,57,0.12)] bg-[rgba(255,252,248,0.7)] px-3.5 py-3 text-left transition-colors hover:border-[hsl(var(--wine)/0.4)] hover:bg-[hsl(var(--wine-muted))]"
                  >
                    <div className="text-[13.5px] font-medium">{id.name}</div>
                    <div className="mt-0.5 text-[11.5px] text-[hsl(var(--warm-charcoal-muted))]">
                      {id.role}
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-center text-[11.5px] text-[hsl(var(--warm-charcoal-muted))]">
                演示身份仅预填用户名，仍需正确密码完成真实登录。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
