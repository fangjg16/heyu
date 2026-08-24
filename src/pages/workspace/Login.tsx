import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getToken, useAuth, useSignIn, useSignUp } from "@clerk/react";
import { LoginParticleCanvas } from "@/components/login/LoginParticleCanvas";
import {
  fetchWorkspaceUsersDirectory,
  loginWithClerkToken,
  loginWithPassword,
} from "@/lib/api-auth";
import { isClerkEnabled } from "@/lib/clerk-enabled";
import {
  clerkErrorToZh,
  isPasswordMatchesIdentifierError,
} from "@/lib/clerk-errors";
import { loadSessionToken, loadSessionUserId } from "@/workspace/session";

const REMEMBER_USER_KEY = "fo-login-remember-user";

const fieldClass =
  "h-11 w-full rounded-xl border border-[hsl(var(--wine)/0.16)] bg-[rgba(255,252,248,0.9)] px-4 text-sm text-[hsl(var(--warm-charcoal))] outline-none focus:border-[hsl(var(--wine)/0.4)]";

const primaryBtnClass =
  "mt-1.5 h-[46px] rounded-xl bg-[hsl(var(--wine))] text-[15px] font-medium text-white transition-colors hover:bg-[hsl(var(--wine-hover))] disabled:opacity-60";

function LoginShell({ children }: { children: ReactNode }) {
  return (
    <div className="login-page flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#F6F3EE] font-sans text-[hsl(var(--warm-charcoal))]">
      <div className="flex min-h-0 flex-1">
        <div className="relative hidden flex-[1.1] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#F2EBE3] via-[#F6F3EE] to-[#F0E7E3] px-[60px] py-14 lg:flex">
          <LoginParticleCanvas className="absolute inset-0 h-full w-full" />

          <div className="relative flex items-center gap-3.5">
            <Link to="/" className="shrink-0">
              <img
                src={`${import.meta.env.BASE_URL}brand/heyu-mark.svg`}
                alt="合域"
                className="h-[52px] w-[52px] rounded-full object-contain"
              />
            </Link>
            <div>
              <div className="font-display text-[22px] font-bold tracking-wide">
                合域AI
              </div>
              <div className="text-xs tracking-[2px] text-[hsl(var(--warm-charcoal-muted))]">
                JOINT FAMILY OFFICE
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="max-w-[560px] font-display text-[34px] font-bold leading-[1.35] tracking-wide">
              为家族办公室建立一个 AI 辅助、权限隔离、可持续更新的项目投资决策工作台。
            </div>
            <div className="mt-5 max-w-[520px] text-[15px] leading-[1.9] text-[hsl(var(--warm-charcoal-muted))]">
              项目资料整理、调研补充、证据核验、动态重评估、报告生成和跨主体协作流程产品化
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

        <div className="flex flex-[0.9] items-center justify-center bg-[#F6F3EE] px-6">
          <div className="w-[420px] max-w-[88%]">{children}</div>
        </div>
      </div>
    </div>
  );
}

async function enterWorkspace() {
  try {
    await fetchWorkspaceUsersDirectory();
  } catch {
    /* ignore */
  }
}

function clerkResetErrorToZh(
  err: { code?: string; message?: string; longMessage?: string } | null | undefined,
): string {
  const code = (err?.code ?? "").trim();
  if (
    code === "form_identifier_not_found" ||
    code === "form_param_nil" ||
    code === "form_identifier_exists"
  ) {
    return "找不到该账号。请确认邮箱或用户名，或联系管理员重置密码。";
  }
  if (
    code === "strategy_for_user_invalid" ||
    code === "reset_password_email_code_not_allowed"
  ) {
    return "该账号无法通过邮箱找回密码，请联系平台管理员。";
  }
  return clerkErrorToZh(
    err,
    "无法发送重置验证码，请确认账号已绑定邮箱。",
  );
}

type ClerkFieldErr = {
  code?: string;
  message?: string;
  longMessage?: string;
} | null;

type ResetPasswordEmailCode = {
  sendCode: () => Promise<{ error?: ClerkFieldErr }>;
  verifyCode: (args: { code: string }) => Promise<{ error?: ClerkFieldErr }>;
  submitPassword: (args: {
    password: string;
    signOutOfOtherSessions?: boolean;
  }) => Promise<{ error?: ClerkFieldErr }>;
};

function getResetPasswordEmailCode(signIn: unknown): ResetPasswordEmailCode | null {
  const api = (signIn as { resetPasswordEmailCode?: ResetPasswordEmailCode } | null)
    ?.resetPasswordEmailCode;
  return api ?? null;
}

async function clerkStartReset(
  signIn: unknown,
  identifier: string,
): Promise<ClerkFieldErr | { message: string }> {
  const create = (
    signIn as {
      create?: (args: { identifier: string }) => Promise<{ error?: ClerkFieldErr }>;
    } | null
  )?.create;
  if (!create) {
    return { message: "当前登录组件不支持找回密码，请联系管理员。" };
  }
  const { error: createError } = await create({ identifier });
  if (createError) return createError;
  const reset = getResetPasswordEmailCode(signIn);
  if (!reset) {
    return { message: "当前登录组件不支持找回密码，请联系管理员。" };
  }
  const { error: sendError } = await reset.sendCode();
  return sendError ?? null;
}

function isLocalLoginHardStop(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : "";
  return (
    msg.includes("未配置") ||
    msg.includes("无法连接") ||
    msg.includes("登录接口不存在")
  );
}

function localLoginErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (msg) return clerkErrorToZh({ message: msg }, msg);
  return "账号或密码不正确，请核对后重试。";
}

function clerkUsernameNotMatchingPassword(
  preferred: string,
  mail: string,
  password: string,
): string {
  const local = (mail.split("@")[0] ?? "").replace(/[^a-zA-Z0-9_]/gu, "");
  const domain = (mail.split("@")[1] ?? "mail")
    .split(".")[0]
    ?.replace(/[^a-zA-Z0-9_]/gu, "") || "mail";
  const pwd = password.toLowerCase();
  const mailLower = mail.toLowerCase();
  for (const candidate of [preferred, local, `${local}_${domain}`]) {
    const n = candidate.trim();
    if (n.length < 4) continue;
    if (n.toLowerCase() === pwd || n.toLowerCase() === mailLower) continue;
    return n;
  }
  return `u${Date.now().toString(36)}`;
}

export default function Login() {
  return (
    <LoginShell>
      {isClerkEnabled() ? <ClerkAuthForm /> : <PasswordAuthForm />}
    </LoginShell>
  );
}

function PasswordAuthForm() {
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

  const onSubmitForm = (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    void (async () => {
      try {
        await loginWithPassword(username, password);
        localStorage.setItem(REMEMBER_USER_KEY, username.trim());
        await enterWorkspace();
        navigate("/app/home", { replace: true });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "账号或密码不正确，请核对后重试。",
        );
        setSubmitting(false);
      }
    })();
  };

  return (
    <>
      <MobileBrand />
      <h1 className="font-display text-[28px] font-semibold">登录工作台</h1>
      <p className="mt-2 text-[13.5px] text-[hsl(var(--warm-charcoal-muted))]">
        请输入账号与密码登录。
      </p>
      {fromSwitch ? <SwitchNotice /> : null}
      <form onSubmit={onSubmitForm} className="mt-[30px] flex flex-col gap-3.5">
        <LabeledInput
          label="用户名"
          type="text"
          autoComplete="username"
          value={username}
          onChange={setUsername}
          disabled={submitting}
          placeholder="账号或邮箱"
        />
        <LabeledInput
          label="密码"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          disabled={submitting}
          placeholder="请输入密码"
        />
        {error ? <ErrorBanner text={error} /> : null}
        <button type="submit" disabled={submitting} className={primaryBtnClass}>
          {submitting ? "登录中..." : "登录"}
        </button>
        <p className="text-center text-[12.5px] text-[hsl(var(--warm-charcoal-muted))]">
          忘记密码请联系平台管理员重置。
        </p>
      </form>
    </>
  );
}

function ClerkAuthForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromSwitch = searchParams.get("switch") === "1";
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn, errors: signInErrors, fetchStatus: signInFetch } = useSignIn();
  const { signUp, errors: signUpErrors, fetchStatus: signUpFetch } = useSignUp();

  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [pending, setPending] = useState<
    null | "signup-email" | "signin-trust" | "reset-code" | "reset-password"
  >(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const autoExchanged = useRef(false);

  const fetching =
    submitting || signInFetch === "fetching" || signUpFetch === "fetching";

  useEffect(() => {
    if (loadSessionUserId() && loadSessionToken()) {
      navigate("/app/home", { replace: true });
      return;
    }
    const remembered = localStorage.getItem(REMEMBER_USER_KEY);
    if (remembered) {
      if (remembered.includes("@")) setEmail(remembered);
      else setUsername(remembered);
    }
  }, [navigate]);

  useEffect(() => {
    if (fromSwitch || !isLoaded || !isSignedIn) return;
    if (loadSessionToken()) return;
    if (autoExchanged.current) return;
    autoExchanged.current = true;
    setSubmitting(true);
    void finishClerkLogin().catch((err) => {
      setError(
        clerkErrorToZh({
          message: err instanceof Error ? err.message : "",
        }, "登录失败"),
      );
      setSubmitting(false);
    });
  }, [fromSwitch, isLoaded, isSignedIn]);

  const finishClerkLogin = async () => {
    const token = await getToken({ skipCache: true });
    if (!token) throw new Error("Clerk 会话无效");
    await loginWithClerkToken(token);
    const remember = (email || username).trim();
    if (remember) localStorage.setItem(REMEMBER_USER_KEY, remember);
    await enterWorkspace();
    navigate("/app/home", { replace: true });
  };

  const noNav = { navigate: async () => undefined };

  const onSignIn = async () => {
    const identifier = (username.trim() || email.trim()).trim();
    if (!identifier || !password) {
      setError("请填写账号和密码");
      return;
    }
    try {
      await loginWithPassword(identifier, password);
      localStorage.setItem(REMEMBER_USER_KEY, identifier);
      await enterWorkspace();
      navigate("/app/home", { replace: true });
      return;
    } catch (localErr) {
      if (isLocalLoginHardStop(localErr)) {
        setError(localLoginErrorMessage(localErr));
        return;
      }
    }
    let err: { code?: string; message?: string; longMessage?: string } | null =
      null;
    try {
      const result = await signIn.password({ identifier, password });
      err = result.error ?? null;
    } catch (clerkErr) {
      setError(
        clerkErrorToZh(
          {
            message: clerkErr instanceof Error ? clerkErr.message : "",
          },
          "账号或密码不正确，请核对后重试。",
        ),
      );
      return;
    }
    if (err) {
      setError(
        clerkErrorToZh(err, "账号或密码不正确，请核对后重试。") ||
          clerkErrorToZh(signInErrors.fields.password, "账号或密码不正确，请核对后重试。"),
      );
      return;
    }
    if (signIn.status === "complete") {
      const { error: finErr } = await signIn.finalize(noNav);
      if (finErr) {
        setError(clerkErrorToZh(finErr));
        return;
      }
      await finishClerkLogin();
      return;
    }
    if (
      signIn.status === "needs_client_trust" ||
      signIn.status === "needs_second_factor"
    ) {
      const { error: sendErr } = await signIn.mfa.sendEmailCode();
      if (sendErr) {
        setError(clerkErrorToZh(sendErr));
        return;
      }
      setPending("signin-trust");
      setError(null);
      return;
    }
    setError("登录未完成，请稍后重试。");
  };

  const forgotIdentifier = () =>
    (username.trim() || email.trim()).trim();

  const onForgotSend = async () => {
    const identifier = forgotIdentifier();
    if (!identifier) {
      setError("请填写账号或邮箱");
      return;
    }
    const err = await clerkStartReset(signIn, identifier);
    if (err) {
      setError(clerkResetErrorToZh(err));
      return;
    }
    setPending("reset-code");
    setError(null);
  };

  const onForgotVerify = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("请填写验证码");
      return;
    }
    const reset = getResetPasswordEmailCode(signIn);
    if (!reset) {
      setError("当前登录组件不支持找回密码，请联系管理员。");
      return;
    }
    const { error: err } = await reset.verifyCode({ code: trimmed });
    if (err) {
      setError(
        clerkErrorToZh(err, clerkErrorToZh(signInErrors.fields.code)),
      );
      return;
    }
    setPending("reset-password");
    setPassword("");
    setPassword2("");
    setError(null);
  };

  const onForgotSetPassword = async () => {
    if (!password) {
      setError("请填写新密码");
      return;
    }
    if (password !== password2) {
      setError("两次输入的密码不一致");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }
    const reset = getResetPasswordEmailCode(signIn);
    if (!reset) {
      setError("当前登录组件不支持找回密码，请联系管理员。");
      return;
    }
    const { error: err } = await reset.submitPassword({
      password,
      signOutOfOtherSessions: true,
    });
    if (err) {
      setError(
        clerkErrorToZh(err, clerkErrorToZh(signInErrors.fields.password)),
      );
      return;
    }
    const status = String(signIn.status ?? "");
    if (status === "complete") {
      const { error: finErr } = await signIn.finalize(noNav);
      if (finErr) {
        setError(clerkErrorToZh(finErr));
        return;
      }
      await finishClerkLogin();
      return;
    }
    if (status === "needs_client_trust" || status === "needs_second_factor") {
      const { error: sendErr } = await signIn.mfa.sendEmailCode();
      if (sendErr) {
        setError(clerkErrorToZh(sendErr));
        return;
      }
      setPending("signin-trust");
      setError(null);
      return;
    }
    setError("密码已更新，请返回登录。");
  };

  const onSignUp = async () => {
    const mail = email.trim();
    const name = username.trim();
    if (!mail || !password) {
      setError("请填写邮箱和密码");
      return;
    }
    if (password !== password2) {
      setError("两次输入的密码不一致");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }
    if (password.toLowerCase() === mail.toLowerCase()) {
      setError("密码不能与邮箱或用户名相同，请换一个。");
      return;
    }
    const extra = name
      ? { firstName: name, unsafeMetadata: { preferredUsername: name } }
      : {};
    const attempt = (clerkUsername?: string) =>
      signUp.password({
        emailAddress: mail,
        password,
        legalAccepted: true,
        locale: "zh-CN",
        ...extra,
        ...(clerkUsername ? { username: clerkUsername } : {}),
      } as Parameters<typeof signUp.password>[0]);

    let { error: err } = await attempt();
    const needsUsername =
      Boolean(err) &&
      !isPasswordMatchesIdentifierError(err) &&
      /username/i.test(
        `${err?.code ?? ""} ${err?.message ?? ""} ${err?.longMessage ?? ""}`,
      );
    if (needsUsername) {
      ({ error: err } = await attempt(
        clerkUsernameNotMatchingPassword(name, mail, password),
      ));
    }
    if (isPasswordMatchesIdentifierError(err)) {
      setError("密码不能与邮箱或用户名相同，请换一个。");
      return;
    }
    if (err) {
      setError(
        clerkErrorToZh(err) ||
          clerkErrorToZh(signUpErrors.fields.emailAddress) ||
          clerkErrorToZh(signUpErrors.fields.password) ||
          clerkErrorToZh(signUpErrors.fields.username),
      );
      return;
    }
    if (signUp.status === "complete") {
      const { error: finErr } = await signUp.finalize(noNav);
      if (finErr) {
        setError(clerkErrorToZh(finErr));
        return;
      }
      await finishClerkLogin();
      return;
    }
    const { error: sendErr } = await signUp.verifications.sendEmailCode();
    if (sendErr) {
      setError(clerkErrorToZh(sendErr));
      return;
    }
    setPending("signup-email");
    setError(null);
  };

  const onVerify = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("请填写验证码");
      return;
    }
    if (pending === "signup-email") {
      const { error: err } = await signUp.verifications.verifyEmailCode({
        code: trimmed,
      });
      if (err) {
        setError(clerkErrorToZh(err, clerkErrorToZh(signUpErrors.fields.code)));
        return;
      }
      if (signUp.status === "complete") {
        const { error: finErr } = await signUp.finalize(noNav);
        if (finErr) {
          setError(clerkErrorToZh(finErr));
          return;
        }
        await finishClerkLogin();
      } else {
        setError("验证未完成，请重新获取验证码。");
      }
      return;
    }
    const { error: err } = await signIn.mfa.verifyEmailCode({ code: trimmed });
    if (err) {
      setError(clerkErrorToZh(err, clerkErrorToZh(signInErrors.fields.code)));
      return;
    }
    if (signIn.status === "complete") {
      const { error: finErr } = await signIn.finalize(noNav);
      if (finErr) {
        setError(clerkErrorToZh(finErr));
        return;
      }
      await finishClerkLogin();
      return;
    }
    setError("验证未完成，请重新获取验证码。");
  };

  const onSubmitForm = (e: FormEvent) => {
    e.preventDefault();
    if (fetching || !isLoaded) return;
    setError(null);
    setSubmitting(true);
    const run =
      pending === "reset-code"
        ? onForgotVerify
        : pending === "reset-password"
          ? onForgotSetPassword
          : pending
            ? onVerify
            : mode === "forgot"
              ? onForgotSend
              : mode === "signup"
                ? onSignUp
                : onSignIn;
    void run()
      .catch((err) => {
        setError(
          clerkErrorToZh({
            message: err instanceof Error ? err.message : "",
          }),
        );
      })
      .finally(() => setSubmitting(false));
  };

  const title = pending === "reset-password"
    ? "设置新密码"
    : pending
      ? "验证邮箱"
      : mode === "signup"
        ? "注册账号"
        : mode === "forgot"
          ? "找回密码"
          : "登录工作台";
  const subtitle =
    pending === "reset-password"
      ? "验证通过，请设置新密码。"
      : pending
        ? "验证码已发送到你的邮箱，请填写后继续。"
        : mode === "signup"
          ? ""
          : mode === "forgot"
            ? "验证码将发到该账号绑定的邮箱。如收不到邮件，请联系管理员。"
            : "请输入账号或邮箱与密码登录。";

  return (
    <>
      <MobileBrand />
      <h1 className="font-display text-[28px] font-semibold">{title}</h1>
      {subtitle ? (
        <p className="mt-2 text-[13.5px] text-[hsl(var(--warm-charcoal-muted))]">
          {subtitle}
        </p>
      ) : null}
      {fromSwitch && !pending ? <SwitchNotice /> : null}

      <form onSubmit={onSubmitForm} className="mt-[30px] flex flex-col gap-3.5">
        {pending === "reset-password" ? (
          <>
            <LabeledInput
              label="新密码"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              disabled={fetching}
              placeholder="至少 8 位"
            />
            <LabeledInput
              label="确认新密码"
              type="password"
              autoComplete="new-password"
              value={password2}
              onChange={setPassword2}
              disabled={fetching}
              placeholder="再输入一次密码"
            />
          </>
        ) : pending ? (
          <LabeledInput
            label="验证码"
            type="text"
            autoComplete="one-time-code"
            value={code}
            onChange={setCode}
            disabled={fetching}
            placeholder="邮箱里的 6 位数字"
          />
        ) : (
          <>
            {mode === "signup" ? (
              <LabeledInput
                label="用户名"
                type="text"
                autoComplete="username"
                value={username}
                onChange={setUsername}
                disabled={fetching}
                placeholder="登录名（可选）"
              />
            ) : null}
            <LabeledInput
              label={mode === "signup" ? "邮箱" : "账号或邮箱"}
              type={mode === "signup" ? "email" : "text"}
              autoComplete={mode === "signup" ? "email" : "username"}
              value={mode === "signup" ? email : username || email}
              onChange={mode === "signup" ? setEmail : (v) => {
                setUsername(v);
                if (v.includes("@")) setEmail(v);
              }}
              disabled={fetching}
              placeholder={mode === "signup" ? "name@example.com" : "账号或邮箱"}
            />
            {mode !== "forgot" ? (
              <LabeledInput
                label="密码"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={setPassword}
                disabled={fetching}
                placeholder={mode === "signup" ? "至少 8 位" : "请输入密码"}
                action={
                  mode === "signin" ? (
                    <button
                      type="button"
                      className="text-[12.5px] text-[hsl(var(--wine))] hover:underline"
                      onClick={() => {
                        setMode("forgot");
                        setPending(null);
                        setPassword("");
                        setPassword2("");
                        setCode("");
                        setError(null);
                      }}
                    >
                      忘记密码？
                    </button>
                  ) : null
                }
              />
            ) : null}
            {mode === "signup" ? (
              <LabeledInput
                label="确认密码"
                type="password"
                autoComplete="new-password"
                value={password2}
                onChange={setPassword2}
                disabled={fetching}
                placeholder="再输入一次密码"
              />
            ) : null}
          </>
        )}
        {error ? <ErrorBanner text={error} /> : null}
        {mode === "signup" || pending === "signup-email" ? (
          <div id="clerk-captcha" className="min-h-0" />
        ) : null}
        <button
          type="submit"
          disabled={fetching || !isLoaded}
          className={primaryBtnClass}
        >
          {!isLoaded
            ? "加载中..."
            : fetching
              ? pending === "reset-password"
                ? "保存中..."
                : pending
                  ? "验证中..."
                  : mode === "forgot"
                    ? "发送中..."
                    : mode === "signup"
                      ? "注册中..."
                      : "登录中..."
              : pending === "reset-password"
                ? "设置新密码并登录"
                : pending === "reset-code"
                  ? "验证"
                  : pending
                    ? "验证并进入"
                    : mode === "forgot"
                      ? "发送验证码"
                      : mode === "signup"
                        ? "注册"
                        : "登录"}
        </button>
      </form>

      {!pending ? (
        <p className="mt-5 text-center text-[13px] text-[hsl(var(--warm-charcoal-muted))]">
          {mode === "signup" ? (
            <>
              已有账号？
              <button
                type="button"
                className="ml-1 text-[hsl(var(--wine))] hover:underline"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
              >
                去登录
              </button>
            </>
          ) : mode === "forgot" ? (
            <>
              想起密码了？
              <button
                type="button"
                className="ml-1 text-[hsl(var(--wine))] hover:underline"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
              >
                去登录
              </button>
            </>
          ) : (
            <>
              没有账号？
              <button
                type="button"
                className="ml-1 text-[hsl(var(--wine))] hover:underline"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
              >
                注册
              </button>
            </>
          )}
        </p>
      ) : (
        <p className="mt-5 text-center text-[13px] text-[hsl(var(--warm-charcoal-muted))]">
          {pending === "reset-code" ? (
            <>
              <button
                type="button"
                className="text-[hsl(var(--wine))] hover:underline"
                disabled={fetching}
                onClick={() => {
                  setError(null);
                  setSubmitting(true);
                  void onForgotSend().finally(() => setSubmitting(false));
                }}
              >
                重新发送
              </button>
              <span className="mx-2 text-[hsl(var(--warm-charcoal-muted))]">·</span>
            </>
          ) : null}
          <button
            type="button"
            className="text-[hsl(var(--wine))] hover:underline"
            onClick={() => {
              setPending(null);
              setCode("");
              setError(null);
              if (pending === "reset-code" || pending === "reset-password") {
                setMode("forgot");
                setPassword("");
                setPassword2("");
              }
            }}
          >
            返回
          </button>
        </p>
      )}
    </>
  );
}

function MobileBrand() {
  return (
    <div className="mb-4 lg:hidden">
      <Link to="/" className="font-display text-lg font-bold text-[hsl(var(--wine))]">
        合域AI
      </Link>
    </div>
  );
}

function SwitchNotice() {
  return (
    <p className="mt-3 rounded-xl border border-[hsl(var(--wine)/0.22)] bg-[hsl(var(--wine-muted))] px-3.5 py-2.5 text-xs text-[hsl(var(--warm-charcoal))]">
      已退出当前会话，请重新输入账号与密码。
    </p>
  );
}

function ErrorBanner({ text }: { text: string }) {
  const zh = clerkErrorToZh({ message: text, longMessage: text });
  return (
    <p className="rounded-xl border border-[hsl(var(--wine)/0.28)] bg-[hsl(var(--wine-muted))] px-3 py-2.5 text-sm">
      {zh}
    </p>
  );
}

function LabeledInput({
  label,
  type,
  autoComplete,
  value,
  onChange,
  disabled,
  placeholder,
  action,
}: {
  label: string;
  type: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
  action?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[12.5px] text-[hsl(var(--warm-charcoal-muted))]">
          {label}
        </div>
        {action}
      </div>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={fieldClass}
        placeholder={placeholder}
      />
    </div>
  );
}
