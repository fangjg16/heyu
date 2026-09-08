import { searchTavily, type TavilyHit } from "./tavily-search";

export type HermesWebSearchEnv = {
  TAVILY_API_KEY?: string;
};

type JsonFn = (data: unknown, status?: number) => Response;

function readJsonFn(): JsonFn {
  return (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
}

export async function handleHermesWebSearch(
  request: Request,
  env: HermesWebSearchEnv,
  json: JsonFn = readJsonFn(),
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  let body: { query?: unknown; maxResults?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query.length < 2) {
    return json({ error: "缺少 query", hits: [] as TavilyHit[] }, 400);
  }

  const maxResults =
    typeof body.maxResults === "number" && Number.isFinite(body.maxResults)
      ? Math.min(8, Math.max(1, Math.floor(body.maxResults)))
      : 5;

  const key = (env.TAVILY_API_KEY || "").trim();
  if (!key) {
    return json(
      {
        hits: [] as TavilyHit[],
        error: "未配置 TAVILY_API_KEY",
      },
      200,
    );
  }

  const result = await searchTavily(key, query, maxResults);
  return json({
    hits: result.hits,
    ...(result.error ? { error: result.error } : {}),
  });
}
