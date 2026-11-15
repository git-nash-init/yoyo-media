import "server-only";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { sha256 } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/ratelimit";
import { ipFromRequest } from "@/lib/security/ip";
import { tokenFromAuthHeader } from "./rules";

export type IngestAuth = { tokenId: string; tokenName: string };

/** Thrown by ingest logic; converted to `{ error, code }` JSON by `ingestRoute`. */
export class IngestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

const NO_STORE = { "Cache-Control": "no-store" };

export const ingestJson = (data: unknown, status = 200) => Response.json(data, { status, headers: NO_STORE });

const AUTH_FAIL_LIMIT = 20;
const AUTH_FAIL_WINDOW_SEC = 600;
const failKey = (ip: string) => `ingest-auth:${ip}`;

/** Is this IP currently locked out? Read-only so successful requests never count. */
async function lockedOutFor(ip: string): Promise<number> {
  const row = await prisma.rateLimit.findUnique({ where: { key: failKey(ip).slice(0, 191) } });
  if (!row || row.count < AUTH_FAIL_LIMIT) return 0;
  const leftMs = row.windowStart.getTime() + AUTH_FAIL_WINDOW_SEC * 1000 - Date.now();
  return leftMs > 0 ? Math.ceil(leftMs / 1000) : 0;
}

/**
 * Bearer-token authentication for YoYo Studio. Not cookie based, so there is no
 * CSRF surface. Failed attempts are rate limited per IP and answered with a
 * detail-free 401. The token itself is never logged.
 */
export async function authenticateIngest(req: Request): Promise<IngestAuth> {
  const ip = ipFromRequest(req);
  const retry = await lockedOutFor(ip);
  if (retry > 0)
    throw new IngestError(429, "RATE_LIMITED", "Too many requests", undefined, { "Retry-After": String(retry) });

  const raw = tokenFromAuthHeader(req.headers.get("authorization"));
  const token = raw
    ? await prisma.ingestToken.findUnique({
        where: { tokenHash: sha256(raw) },
        select: { id: true, name: true, revokedAt: true, lastUsedAt: true },
      })
    : null;

  if (!token || token.revokedAt) {
    await rateLimit(failKey(ip), AUTH_FAIL_LIMIT, AUTH_FAIL_WINDOW_SEC);
    throw new IngestError(401, "UNAUTHORIZED", "Unauthorized", undefined, { "WWW-Authenticate": "Bearer" });
  }

  // Chunk uploads arrive many times a minute; one write per minute is plenty.
  if (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 60_000) {
    await prisma.ingestToken
      .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
      .catch((e) => log.warn("ingest lastUsedAt update failed", { error: e }));
  }
  return { tokenId: token.id, tokenName: token.name };
}

/** Wrap a handler with authentication and uniform JSON error handling. */
export async function ingestRoute(
  req: Request,
  handler: (auth: IngestAuth) => Promise<Response>,
): Promise<Response> {
  try {
    const auth = await authenticateIngest(req);
    return await handler(auth);
  } catch (e) {
    if (e instanceof IngestError) {
      return Response.json(
        { error: e.message, code: e.code, ...(e.extra ?? {}) },
        { status: e.status, headers: { ...NO_STORE, ...(e.headers ?? {}) } },
      );
    }
    log.error("ingest request failed", { path: new URL(req.url).pathname, error: e });
    return Response.json({ error: "Internal error", code: "INTERNAL" }, { status: 500, headers: NO_STORE });
  }
}

/** Parse a JSON body (small, capped) or throw a 400. */
export async function readJsonBody(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const buf = await readBodyCapped(req, maxBytes);
  if (!buf) throw new IngestError(413, "BODY_TOO_LARGE", "Request body is too large");
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    throw new IngestError(400, "BAD_JSON", "Request body must be valid JSON");
  }
}

/** Read the request body into memory, giving up (null) as soon as it exceeds `maxBytes`. */
export async function readBodyCapped(req: Request, maxBytes: number): Promise<Buffer | null> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  return Buffer.concat(parts, total);
}
