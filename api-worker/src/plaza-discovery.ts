/**
 * 项目广场：已登录内部账号默认可发现全开放项目。
 * 仅账号默认身份为「项目协作方」时不逛广场（只做被邀请的协作项目）。
 */
export function membershipsAllowPlazaDiscovery(
  _roles: Iterable<string>,
  accountDefaultRole?: string | null,
): boolean {
  const def = String(accountDefaultRole ?? "").trim().toLowerCase();
  return def !== "issuer";
}
