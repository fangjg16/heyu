import type { AppDatabase } from "./app-database";
import { assertMysqlConfigured, type MysqlEnv } from "./app-database";
import { createMysqlDatabase } from "./mysql-db";

export type DbResolveEnv = MysqlEnv;

let cachedMysql: AppDatabase | null = null;
let cachedMysqlKey: string | null = null;

function mysqlCacheKey(env: MysqlEnv): string {
  return [
    env.MYSQL_HOST ?? "",
    env.MYSQL_PORT ?? "",
    env.MYSQL_USER ?? "",
    env.MYSQL_DATABASE ?? "",
  ].join("|");
}

export async function resolveDatabase(env: DbResolveEnv): Promise<AppDatabase> {
  assertMysqlConfigured(env);

  const key = mysqlCacheKey(env);
  if (cachedMysql && cachedMysqlKey === key) {
    return cachedMysql;
  }

  cachedMysql = await createMysqlDatabase(env);
  cachedMysqlKey = key;
  return cachedMysql;
}
