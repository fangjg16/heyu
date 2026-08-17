/** MySQL 8 预处理不能绑定 LIMIT/OFFSET，会报 mysqld_stmt_execute。 */

export function toSafeInt(value, fallback, max = 10000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(max, Math.trunc(n)));
}

/**
 * 把 SQL 末尾的 LIMIT ? / OFFSET ? 写成整数，并从 params 弹出对应值。
 */
export function rewriteLimitOffsetPlaceholders(sql, params) {
  const out = Array.isArray(params) ? [...params] : [];
  let s = String(sql ?? "");
  const offsetTail = /\bLIMIT\s+\?\s+OFFSET\s+\?\s*;?\s*$/i;
  const limitTail = /\bLIMIT\s+\?\s*;?\s*$/i;
  if (offsetTail.test(s) && out.length >= 2) {
    const offset = toSafeInt(out.pop(), 0);
    const limit = toSafeInt(out.pop(), 1);
    s = s.replace(offsetTail, `LIMIT ${limit} OFFSET ${offset}`);
  } else if (limitTail.test(s) && out.length >= 1) {
    const limit = toSafeInt(out.pop(), 1);
    s = s.replace(limitTail, `LIMIT ${limit}`);
  }
  return { sql: s, params: out };
}
