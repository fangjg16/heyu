/**
 * 项目广场：投资团队账号、尚未入组的内部账号可发现全开放项目。
 * 仅「账号默认身份是项目协作方」或「已加入项目全部是协作方、且账号也不是投资档」时不逛广场。
 */
export function membershipsAllowPlazaDiscovery(
  roles: Iterable<string>,
  accountDefaultRole?: string | null,
): boolean {
  const def = String(accountDefaultRole ?? "").trim().toLowerCase();
  if (def === "issuer") return false;
  if (def === "admin" || def === "core" || def === "mid" || def === "low") {
    return true;
  }
  const list = [...roles]
    .map((r) => String(r).trim().toLowerCase())
    .filter((r) => r && r !== "guest");
  if (list.length === 0) return true;
  return list.some((r) => r !== "issuer");
}
