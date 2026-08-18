type ClerkLikeError = {
  code?: string;
  message?: string;
  longMessage?: string;
} | null | undefined;

const CODE_ZH: Record<string, string> = {
  form_identifier_not_found: "账号或密码不正确，请核对后重试。",
  form_password_incorrect: "账号或密码不正确，请核对后重试。",
  strategy_for_user_invalid: "账号或密码不正确，请核对后重试。",
  form_identifier_exists: "该邮箱或用户名已注册，请直接登录。",
  form_param_format_invalid: "邮箱或用户名格式不正确。",
  form_password_length_too_short: "密码至少 8 位。",
  form_password_pwned: "该密码过于常见，请换一个更安全的密码。",
  form_password_size_in_bytes_exceeded: "密码过长，请缩短后再试。",
  form_username_invalid_length: "用户名长度不符合要求。",
  form_username_invalid_character: "用户名只能含字母、数字或下划线。",
  form_code_incorrect: "验证码不正确，请重试。",
  verification_failed: "验证失败，请重新获取验证码。",
  verification_expired: "验证码已过期，请重新获取。",
  captcha_invalid: "请完成人机验证后重试。",
  too_many_requests: "尝试过于频繁，请稍后再试。",
  session_exists: "该账号已在本机登录。",
};

export function clerkErrorToZh(
  err: ClerkLikeError,
  fallback = "操作失败，请稍后重试。",
): string {
  const code = (err?.code ?? "").trim();
  if (code && CODE_ZH[code]) return CODE_ZH[code]!;
  const msg = (err?.longMessage || err?.message || "").trim();
  return msg || fallback;
}
