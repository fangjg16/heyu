import { AwsClient } from "aws4fetch";
import type {
  AppObjectBody,
  AppObjectGetOptions,
  AppObjectPutOptions,
  AppObjectStorage,
  MinioEnv,
} from "./app-storage";

function normalizeEndpoint(raw: string): string {
  return raw.trim().replace(/\/+$/u, "");
}

function encodeObjectKey(key: string): string {
  return key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function objectUrl(endpoint: string, bucket: string, key: string): string {
  return `${normalizeEndpoint(endpoint)}/${bucket}/${encodeObjectKey(key)}`;
}

function toBodyStream(
  value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob | null,
): BodyInit | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (value instanceof ReadableStream) return value;
  if (value instanceof Blob) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  }
  return value as ArrayBuffer;
}

class MinioObjectBody implements AppObjectBody {
  constructor(
    private readonly response: Response,
    readonly body: ReadableStream | null,
  ) {}

  get status(): number {
    return this.response.status;
  }

  get size(): number | null {
    const raw = this.response.headers.get("Content-Length");
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  get contentRange(): string | null {
    return this.response.headers.get("Content-Range");
  }

  async text(): Promise<string> {
    return this.response.text();
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.response.arrayBuffer();
  }
}

export class MinioObjectStorage implements AppObjectStorage {
  private readonly client: AwsClient;
  private readonly endpoint: string;
  private readonly bucket: string;
  readonly maxUploadBytes: number;

  constructor(env: MinioEnv) {
    const endpoint = normalizeEndpoint(env.MINIO_ENDPOINT ?? "");
    const accessKey = (env.MINIO_ACCESS_KEY ?? "").trim();
    const secretKey = env.MINIO_SECRET_KEY ?? "";
    const bucket = (env.MINIO_BUCKET ?? "").trim();
    if (!endpoint || !accessKey || !secretKey || !bucket) {
      throw new Error(
        "MinIO 未配置完整：需要 MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_BUCKET",
      );
    }

    this.endpoint = endpoint;
    this.bucket = bucket;
    this.client = new AwsClient({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      service: "s3",
      region: (env.MINIO_REGION ?? "us-east-1").trim() || "us-east-1",
    });
    // 产品要求：不按体积拦截上传（忽略 MINIO_MAX_UPLOAD_BYTES）
    this.maxUploadBytes = 0;
  }

  private urlFor(key: string): string {
    return objectUrl(this.endpoint, this.bucket, key);
  }

  async get(key: string, options?: AppObjectGetOptions): Promise<AppObjectBody | null> {
    const headers: Record<string, string> = {};
    const range = options?.range?.trim();
    if (range) headers.Range = range;
    const res = await this.client.fetch(this.urlFor(key), { method: "GET", headers });
    if (res.status === 404) return null;
    if (!res.ok && res.status !== 206) {
      throw new Error(`MinIO GET ${key} failed: HTTP ${res.status}`);
    }
    return new MinioObjectBody(res, res.body);
  }

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob | null,
    options?: AppObjectPutOptions,
  ): Promise<void> {
    const body = toBodyStream(value);
    if (body === null) {
      throw new Error("MinIO PUT body is null");
    }


    const headers: Record<string, string> = {};
    const ct = options?.httpMetadata?.contentType;
    if (ct) headers["Content-Type"] = ct;

    const res = await this.client.fetch(this.urlFor(key), {
      method: "PUT",
      body,
      headers,
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new Error(`MinIO PUT ${key} failed: HTTP ${res.status} ${detail}`);
    }
  }

  async delete(key: string): Promise<void> {
    const res = await this.client.fetch(this.urlFor(key), { method: "DELETE" });
    if (res.status === 404) return;
    if (!res.ok) {
      throw new Error(`MinIO DELETE ${key} failed: HTTP ${res.status}`);
    }
  }
}

export function createMinioStorage(env: MinioEnv): AppObjectStorage {
  return new MinioObjectStorage(env);
}
