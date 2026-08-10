/** MySQL 适配器共用的数据库接口 */
export interface AppPreparedStatement {
  bind(...values: unknown[]): AppPreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta?: { duration?: number } }>;
  run(): Promise<{
    success: boolean;
    meta?: { changes?: number; last_row_id?: number; duration?: number };
  }>;
}

export interface AppDatabase {
  prepare(query: string): AppPreparedStatement;
}

export type MysqlEnv = {
  DB_DRIVER?: string;
  MYSQL_HOST?: string;
  MYSQL_PORT?: string;
  MYSQL_USER?: string;
  MYSQL_PASSWORD?: string;
  MYSQL_DATABASE?: string;
  MYSQL_BRIDGE_URL?: string;
  MYSQL_BRIDGE_KEY?: string;
};

export function isMysqlConfigured(env: MysqlEnv): boolean {
  return Boolean((env.MYSQL_HOST ?? "").trim() || (env.MYSQL_BRIDGE_URL ?? "").trim());
}

export function assertMysqlConfigured(env: MysqlEnv): void {
  if (!isMysqlConfigured(env)) {
    throw new Error(
      "MySQL 未配置：需要 MYSQL_HOST（或 MYSQL_BRIDGE_URL）及 MYSQL_USER、MYSQL_DATABASE",
    );
  }
}
