type ClerkLikeError = {
  code?: string;
  message?: string;
  longMessage?: string;
  errors?: Array<{
    code?: string;
    message?: string;
    longMessage?: string;
  }>;
} | null | undefined;

const CODE_ZH: Record<string, string> = {
  form_password_or_identifier_incorrect: "账号或密码不正确，请核对后重试。",
  form_identifier_not_found: "账号或密码不正确，请核对后重试。",
  form_password_incorrect: "账号或密码不正确，请核对后重试。",
  strategy_for_user_invalid: "账号或密码不正确，请核对后重试。",
  form_identifier_exists: "该邮箱或用户名已注册，请直接登录。",
  form_param_format_invalid: "邮箱或用户名格式不正确。",
  form_password_length_too_short: "密码至少 8 位。",
  form_password_pwned: "该密码过于常见，请换一个更安全的密码。",
  form_password_size_in_bytes_exceeded: "密码过长，请缩短后再试。",
  form_password_matches_identifier: "密码不能与邮箱或用户名相同，请换一个。",
  form_password_not_strong_enough: "密码强度不够，请换一个。",
  form_username_invalid_length: "用户名长度不符合要求。",
  form_username_invalid_character: "用户名只能含字母、数字或下划线。",
  form_code_incorrect: "验证码不正确，请重试。",
  form_code_expired: "验证码已过期，请重新获取。",
  verification_failed: "验证失败，请重新获取验证码。",
  verification_expired: "验证码已过期，请重新获取。",
  reset_password_email_code_not_allowed:
    "该账号无法通过邮箱找回密码，请联系平台管理员。",
  captcha_invalid: "请完成人机验证后重试。",
  too_many_requests: "尝试过于频繁，请稍后再试。",
  session_exists: "该账号已在本机登录。",
};

const MSG_ZH: Array<[RegExp, string]> = [
  [/failed to fetch|networkerror|load failed/i, "无法连接登录服务，请稍后重试。"],
  [/password cannot match/i, CODE_ZH.form_password_matches_identifier!],
  [/password is too short/i, CODE_ZH.form_password_length_too_short!],
  [/already exists/i, CODE_ZH.form_identifier_exists!],
  [/incorrect (password|code)|invalid code/i, "账号或验证码不正确，请重试。"],
  [/could not find|identifier not found|couldn't find your account/i, "找不到该账号，请确认邮箱或用户名。"],
  [/reset password|password reset/i, "无法发送重置验证码，请确认账号已绑定邮箱。"],
];

function looksEnglish(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/gu, "");
  const cjk = text.replace(/[^\u4e00-\u9fff]/gu, "");
  return letters.length >= 8 && cjk.length === 0;
}

export function clerkErrorToZh(
  err: ClerkLikeError,
  fallback = "操作失败，请稍后重试。",
): string {
  const nested = err?.errors?.[0];
  const code = (err?.code ?? nested?.code ?? "").trim();
  if (code && CODE_ZH[code]) return CODE_ZH[code]!;
  const msg = (
    err?.longMessage ||
    nested?.longMessage ||
    err?.message ||
    nested?.message ||
    ""
  ).trim();
  for (const [re, zh] of MSG_ZH) {
    if (re.test(msg)) return zh;
  }
  if (!msg || looksEnglish(msg)) return fallback;
  return msg;
}

export function isPasswordMatchesIdentifierError(err: ClerkLikeError): boolean {
  const code = (err?.code ?? "").trim();
  if (code === "form_password_matches_identifier") return true;
  const msg = `${err?.longMessage ?? ""} ${err?.message ?? ""}`;
  return /password cannot match/i.test(msg);
}
