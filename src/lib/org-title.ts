/** 隶属组织只保留组织名，去掉误写在后面的权限档文案 */
const ORG_ROLE_SUFFIX =
  /\s*[·•]\s*(Admin|Core(?:\s*核心级)?|Basic(?:\s*基础级)?|Advanced(?:\s*进阶级)?|Guest)\s*$/iu;

export function stripOrgRoleLabel(raw: string | null | undefined): string {
  let t = String(raw ?? "").trim();
  t = t.replace(ORG_ROLE_SUFFIX, "").trim();
  return t;
}
