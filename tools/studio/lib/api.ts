// HTTP client for the site's ingest API plus the resumable chunk uploader.
// The token is only ever placed in the Authorization header; it is never printed.
import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { MAX_TRIES, backoffMs, isRetryableStatus, nextChunk, DEFAULT_CHUNK_SIZE } from "./chunks";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: Record<string, unknown>,
    public retryAfterSec?: number,
  ) {
    super(message);
  }
}
/** Could not reach the site at all (offline, wrong address, timeout). */
export class NetworkError extends Error {}
/** 401: the token is wrong or was revoked. */
export class AuthError extends Error {}
/** Retries ran out: the connection is too unreliable right now. Work is kept for the next run. */
export class GaveUpError extends Error {}
/** The server discarded the upload (e.g. checksum mismatch); it has to start again from zero. */
export class RestartUploadError extends Error {}

export type Ping = { ok: boolean; tokenName: string; maxVideoBytes: number; maxImageBytes?: number; chunkSize: number };
export type UploadStatus = { received: number; totalSize: number; status: string };
export type UploadKind = "video" | "preview" | "thumb";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class StudioClient {
  constructor(
    private siteUrl: string,
    private token: string,
  ) {}

  private async request(
    method: string,
    path: string,
    opts: { json?: unknown; body?: Uint8Array; headers?: Record<string, string>; timeoutMs?: number } = {},
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}`, Accept: "application/json", ...opts.headers };
    let body: BodyInit | undefined;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    } else if (opts.body) {
      headers["Content-Type"] = "application/octet-stream";
      body = opts.body as unknown as BodyInit;
    }

    let res: Response;
    let text: string;
    try {
      res = await fetch(`${this.siteUrl}/api/admin/ingest${path}`, {
        method,
        headers,
        body,
        redirect: "error",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });
      text = await res.text();
    } catch (e) {
      const name = (e as Error)?.name;
      throw new NetworkError(name === "TimeoutError" || name === "AbortError" ? "the site took too long to answer" : "could not connect to the site");
    }

    let data: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    } catch {
      /* non-JSON answer (e.g. an HTML error page from the host) */
    }
    if (res.ok) return data;
    if (res.status === 401) throw new AuthError("The site did not accept the token.");
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new ApiError(
      res.status,
      typeof data.code === "string" ? data.code : `HTTP_${res.status}`,
      typeof data.error === "string" ? data.error : `The site answered with HTTP ${res.status}`,
      data,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }

  async ping(): Promise<Ping> {
    return (await this.request("GET", "/ping", { timeoutMs: 15_000 })) as unknown as Ping;
  }
  async startUpload(p: { kind: UploadKind; filename: string; totalSize: number; sha256: string }) {
    return (await this.request("POST", "/uploads", { json: p })) as unknown as { uploadId: string; chunkSize: number; received: number };
  }
  async getUpload(id: string): Promise<UploadStatus> {
    return (await this.request("GET", `/uploads/${encodeURIComponent(id)}`)) as unknown as UploadStatus;
  }
  async putChunk(id: string, offset: number, chunk: Uint8Array): Promise<{ received: number }> {
    return (await this.request("PUT", `/uploads/${encodeURIComponent(id)}?offset=${offset}`, {
      body: chunk,
      headers: { "X-Chunk-Sha256": createHash("sha256").update(chunk).digest("hex") },
      timeoutMs: 100_000,
    })) as unknown as { received: number };
  }
  async completeUpload(id: string) {
    // The server re-hashes the whole file here; allow it most of the host's 120 s budget.
    return this.request("POST", `/uploads/${encodeURIComponent(id)}/complete`, { timeoutMs: 115_000 });
  }
  async createVideo(p: {
    title: string;
    type: "LONG" | "SHORT";
    durationSec: number;
    description?: string;
    videoUploadId: string;
    previewUploadId?: string;
    thumbUploadIds: string[];
  }) {
    return (await this.request("POST", "/videos", { json: p })) as unknown as { videoId: string; slug: string; adminUrl: string };
  }
}

export type RetryNotice = (info: { attempt: number; waitMs: number; reason: string }) => void;

/** Retry network errors and retryable statuses with exponential backoff (about 5 tries). */
export async function withRetry<T>(fn: () => Promise<T>, onRetry?: RetryNotice, tries = MAX_TRIES): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = e instanceof NetworkError || (e instanceof ApiError && isRetryableStatus(e.status));
      if (!retryable) throw e;
      if (attempt >= tries)
        throw new GaveUpError(e instanceof NetworkError ? e.message : `the site keeps answering with an error (${(e as ApiError).status})`);
      const waitMs = e instanceof ApiError && e.retryAfterSec ? Math.min(e.retryAfterSec * 1000, 60_000) : backoffMs(attempt);
      onRetry?.({ attempt, waitMs, reason: e instanceof NetworkError ? e.message : `server error ${(e as ApiError).status}` });
      await sleep(waitMs);
    }
  }
}

export type UploadTarget = {
  kind: UploadKind;
  path: string;
  filename: string;
  size: number;
  sha256: string;
  uploadId?: string;
};

/**
 * Upload one file in chunks, resuming a previous attempt when `target.uploadId` is set.
 * Returns the upload id once the server has verified the checksum.
 */
export async function uploadFile(
  client: StudioClient,
  target: UploadTarget,
  hooks: {
    onProgress: (received: number) => void;
    onUploadId: (id: string) => Promise<void> | void;
    onRetry?: RetryNotice;
  },
): Promise<string> {
  let id = target.uploadId;
  let received = 0;
  let chunkSize = DEFAULT_CHUNK_SIZE;

  if (id) {
    try {
      const st = await withRetry(() => client.getUpload(id!), hooks.onRetry);
      if (st.totalSize !== target.size) id = undefined; // belongs to an older encode of this file
      else if (st.status !== "UPLOADING") {
        hooks.onProgress(target.size);
        return id; // already verified by the server on a previous run
      } else received = st.received;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) id = undefined; // expired on the server: start over
      else throw e;
    }
  }
  if (!id) {
    const started = await withRetry(
      () => client.startUpload({ kind: target.kind, filename: target.filename, totalSize: target.size, sha256: target.sha256 }),
      hooks.onRetry,
    );
    id = started.uploadId;
    received = started.received ?? 0;
    if (started.chunkSize > 0) chunkSize = Math.min(started.chunkSize, 8 * 1024 * 1024);
    await hooks.onUploadId(id);
  }
  const uploadId = id;
  hooks.onProgress(received);

  const fh = await open(target.path, "r");
  try {
    for (let round = 0; round < 4; round++) {
      let finishedElsewhere = false;
      for (let chunk = nextChunk(target.size, chunkSize, received); chunk; chunk = nextChunk(target.size, chunkSize, received)) {
        const buf = Buffer.allocUnsafe(chunk.length);
        const { bytesRead } = await fh.read(buf, 0, chunk.length, chunk.offset);
        if (bytesRead !== chunk.length) throw new Error("The processed file changed on disk while uploading.");
        const offset = chunk.offset;
        try {
          const r = await withRetry(async () => {
            try {
              return await client.putChunk(uploadId, offset, buf);
            } catch (e) {
              // A damaged chunk is simply sent again.
              if (e instanceof ApiError && e.code === "CHUNK_HASH_MISMATCH") throw new NetworkError("a chunk was damaged in transit");
              throw e;
            }
          }, hooks.onRetry);
          received = r.received;
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            // The server is ahead/behind us (e.g. a chunk landed but its answer got lost): resync.
            if (e.code === "NOT_UPLOADING") {
              finishedElsewhere = true;
              break;
            }
            const st = typeof e.body.received === "number" ? { received: e.body.received } : await withRetry(() => client.getUpload(uploadId), hooks.onRetry);
            received = st.received;
          } else if (e instanceof ApiError && (e.status === 404 || e.code === "BAD_FILE_TYPE")) {
            throw e.status === 404 ? new RestartUploadError("the site no longer has this upload") : e;
          } else throw e;
        }
        hooks.onProgress(received);
      }
      if (finishedElsewhere) break;

      try {
        await withRetry(() => client.completeUpload(uploadId), hooks.onRetry);
        break;
      } catch (e) {
        if (e instanceof ApiError && e.code === "UPLOAD_INCOMPLETE" && typeof e.body.received === "number" && round < 3) {
          received = e.body.received; // part went missing on the server: send it again
          continue;
        }
        if (e instanceof ApiError && (e.code === "HASH_MISMATCH" || e.status === 404))
          throw new RestartUploadError("the uploaded copy did not match the original");
        throw e;
      }
    }
  } finally {
    await fh.close();
  }
  hooks.onProgress(target.size);
  return uploadId;
}
