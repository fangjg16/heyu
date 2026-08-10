import type { AppObjectStorage } from "./app-storage";
import { assertMinioConfigured, type MinioEnv } from "./app-storage";
import { createMinioStorage } from "./minio-storage";

export type FilesResolveEnv = MinioEnv;

let cachedMinio: AppObjectStorage | null = null;
let cachedMinioKey: string | null = null;

function minioCacheKey(env: MinioEnv): string {
  return [
    env.MINIO_ENDPOINT ?? "",
    env.MINIO_BUCKET ?? "",
    env.MINIO_ACCESS_KEY ?? "",
  ].join("|");
}

export function resolveFiles(env: FilesResolveEnv): AppObjectStorage {
  assertMinioConfigured(env);

  const key = minioCacheKey(env);
  if (cachedMinio && cachedMinioKey === key) {
    return cachedMinio;
  }

  cachedMinio = createMinioStorage(env);
  cachedMinioKey = key;
  return cachedMinio;
}
