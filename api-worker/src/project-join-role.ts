/** 审批通过时可写入的成员身份：项目协作方，或投资方三档权限。 */
export type JoinApproveRole = "admin" | "core" | "low" | "issuer";

export function isJoinApproveRole(role: string): role is JoinApproveRole {
  return role === "admin" || role === "core" || role === "low" || role === "issuer";
}

/**
 * 解析审批通过时指定的身份。
 * 未传或空字符串 → fallback（默认 Basic）；非法值 → null（调用方应 400）。
 */
export function parseApprovedJoinRole(
  raw: unknown,
  fallback: JoinApproveRole = "low",
): JoinApproveRole | null {
  if (raw == null) return fallback;
  const role = String(raw).trim().toLowerCase();
  if (role === "") return fallback;
  if (isJoinApproveRole(role)) return role;
  return null;
}
