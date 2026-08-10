import type { AppDatabase, AppPreparedStatement } from "./app-database";

export type MysqlEnv = {
  MYSQL_BRIDGE_URL?: string;
  MYSQL_BRIDGE_KEY?: string;
};

/** SQLite/D1 方言 → MySQL 8 */
export function translateSqliteDialectToMysql(sql: string): string {
  let s = sql;
  s = s.replace(/\bINSERT OR IGNORE\b/gi, "INSERT IGNORE");
  s = s.replace(/\bdatetime\s*\(\s*([\w.]+)\s*\)/gi, "$1");
  s = s.replace(
    /\bON CONFLICT\s*\([^)]+\)\s*DO UPDATE SET\b/gi,
    "ON DUPLICATE KEY UPDATE",
  );
  s = s.replace(/\bexcluded\.(\w+)\b/gi, "VALUES($1)");
  return s;
}

type ExecuteMode = "first" | "all" | "run";

type BridgeResponse = {
  success?: boolean;
  results?: unknown[];
  row?: unknown;
  meta?: { changes?: number; last_row_id?: number };
  error?: string;
};

async function bridgeExecute(
  bridgeUrl: string,
  bridgeKey: string | undefined,
  sql: string,
  params: unknown[],
  mode: ExecuteMode,
): Promise<BridgeResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bridgeKey) headers.Authorization = `Bearer ${bridgeKey}`;

  const res = await fetch(`${bridgeUrl.replace(/\/+$/u, "")}/v1/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({ sql, params, mode }),
  });

  let data: BridgeResponse;
  try {
    data = (await res.json()) as BridgeResponse;
  } catch {
    throw new Error(`MySQL bridge invalid response (HTTP ${res.status})`);
  }

  if (!res.ok || data.success === false) {
    throw new Error(data.error ?? `MySQL bridge HTTP ${res.status}`);
  }
  return data;
}

class MysqlBridgePreparedStatement implements AppPreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly bridgeUrl: string,
    private readonly bridgeKey: string | undefined,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): AppPreparedStatement {
    this.values = values;
    return this;
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const data = await bridgeExecute(
      this.bridgeUrl,
      this.bridgeKey,
      this.sql,
      this.values,
      "first",
    );
    const row = data.row as Record<string, unknown> | null | undefined;
    if (!row) return null;
    if (colName) return (row[colName] as T) ?? null;
    return row as T;
  }

  async all<T = unknown>(): Promise<{
    results: T[];
    success: boolean;
    meta?: { duration?: number };
  }> {
    const data = await bridgeExecute(
      this.bridgeUrl,
      this.bridgeKey,
      this.sql,
      this.values,
      "all",
    );
    return { results: (data.results ?? []) as T[], success: true };
  }

  async run(): Promise<{
    success: boolean;
    meta?: { changes?: number; last_row_id?: number; duration?: number };
  }> {
    const data = await bridgeExecute(
      this.bridgeUrl,
      this.bridgeKey,
      this.sql,
      this.values,
      "run",
    );
    return { success: true, meta: data.meta };
  }
}

class MysqlBridgeDatabase implements AppDatabase {
  constructor(
    private readonly bridgeUrl: string,
    private readonly bridgeKey: string | undefined,
  ) {}

  prepare(query: string): AppPreparedStatement {
    const sql = translateSqliteDialectToMysql(query);
    return new MysqlBridgePreparedStatement(this.bridgeUrl, this.bridgeKey, sql);
  }
}

export async function createMysqlDatabase(env: MysqlEnv): Promise<AppDatabase> {
  const bridgeUrl = (env.MYSQL_BRIDGE_URL ?? "http://127.0.0.1:8790").trim();
  if (!bridgeUrl) {
    throw new Error("MYSQL_BRIDGE_URL is required when DB_DRIVER=mysql");
  }
  const bridgeKey = (env.MYSQL_BRIDGE_KEY ?? "").trim() || undefined;

  const health = await fetch(`${bridgeUrl.replace(/\/+$/u, "")}/health`);
  if (!health.ok) {
    throw new Error(
      `MySQL bridge not reachable at ${bridgeUrl}. Start api-worker with npm run dev:local (auto-starts bridge).`,
    );
  }

  return new MysqlBridgeDatabase(bridgeUrl, bridgeKey);
}
