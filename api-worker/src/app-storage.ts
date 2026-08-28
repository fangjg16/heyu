/** MinIO 对象存储接口 */
export type AppObjectPutOptions = {
  httpMetadata?: { contentType?: string };
};

export type AppObjectGetOptions = {
  /** 原样转给存储的 Range，例如 bytes=0-65535 */
  range?: string;
};

export interface AppObjectBody {
  readonly body: ReadableStream | null;
  readonly status?: number;
  readonly size?: number | null;
  readonly contentRange?: string | null;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface AppObjectStorage {
  get(key: string, options?: AppObjectGetOptions): Promise<AppObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob | null,
    options?: AppObjectPutOptions,
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export type MinioEnv = {
  FILE_DRIVER?: string;
  MINIO_ENDPOINT?: string;
  MINIO_ACCESS_KEY?: string;
  MINIO_SECRET_KEY?: string;
  MINIO_BUCKET?: string;
  MINIO_REGION?: string;
  MINIO_MAX_UPLOAD_BYTES?: string;
};

export function isMinioConfigured(env: MinioEnv): boolean {
  return Boolean((env.MINIO_ENDPOINT ?? "").trim() && (env.MINIO_BUCKET ?? "").trim());
}

export function assertMinioConfigured(env: MinioEnv): void {
  if (!isMinioConfigured(env)) {
    throw new Error(
      "MinIO 未配置：需要 MINIO_ENDPOINT、MINIO_ACCESS_KEY、MINIO_SECRET_KEY、MINIO_BUCKET",
    );
  }
}
