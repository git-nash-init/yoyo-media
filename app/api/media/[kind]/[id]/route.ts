import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { storage, MIME_BY_EXT } from "@/lib/storage";
import { rateLimit } from "@/lib/security/ratelimit";
import { ipFromRequest } from "@/lib/security/ip";

export const dynamic = "force-dynamic";

const json = (error: string, code: string, status: number) => Response.json({ error, code }, { status });

function mimeOf(rel: string) {
  return MIME_BY_EXT[rel.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** Stream a stored file with HTTP Range support (needed for seeking in <video>). */
async function serveFile(req: Request, rel: string, opts: { cache: string; downloadName?: string }) {
  const size = await storage.size(rel);
  if (size == null) return json("File not found", "NOT_FOUND", 404);

  const headers = new Headers({
    "Content-Type": mimeOf(rel),
    "Accept-Ranges": "bytes",
    "Cache-Control": opts.cache,
    "X-Content-Type-Options": "nosniff",
  });
  if (opts.downloadName) {
    const safe = opts.downloadName.replace(/[^\w.\- ]/g, "_");
    headers.set("Content-Disposition", `attachment; filename="${safe}"`);
  }

  const range = req.headers.get("range");
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(storage.readStream(rel, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  if (req.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(Readable.toWeb(storage.readStream(rel)) as ReadableStream, { status: 200, headers });
}

const PUBLIC_CACHE = "public, max-age=86400, stale-while-revalidate=604800";
const PRIVATE_CACHE = "private, no-store";

export async function GET(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await ctx.params;

  switch (kind) {
    // ---- Public artwork ----
    case "thumb":
    case "preview": {
      const v = await prisma.video.findUnique({
        where: { id },
        select: { thumbPath: true, previewPath: true, status: true },
      });
      const rel = kind === "thumb" ? v?.thumbPath : v?.previewPath;
      if (!v || !rel) return json("Not found", "NOT_FOUND", 404);
      if (v.status !== "PUBLISHED") {
        const user = await getCurrentUser();
        if (user?.role !== "ADMIN") return json("Not found", "NOT_FOUND", 404);
        return serveFile(req, rel, { cache: PRIVATE_CACHE });
      }
      return serveFile(req, rel, { cache: PUBLIC_CACHE });
    }
    case "channel": {
      const c = await prisma.channel.findUnique({ where: { id }, select: { logoPath: true } });
      return c?.logoPath ? serveFile(req, c.logoPath, { cache: PUBLIC_CACHE }) : json("Not found", "NOT_FOUND", 404);
    }
    case "model": {
      const m = await prisma.model.findUnique({ where: { id }, select: { photoPath: true } });
      return m?.photoPath ? serveFile(req, m.photoPath, { cache: PUBLIC_CACHE }) : json("Not found", "NOT_FOUND", 404);
    }
    case "series": {
      const s = await prisma.series.findUnique({ where: { id }, select: { posterPath: true } });
      return s?.posterPath ? serveFile(req, s.posterPath, { cache: PUBLIC_CACHE }) : json("Not found", "NOT_FOUND", 404);
    }

    // ---- Admin-only: candidate thumbnails ----
    case "candidate": {
      const user = await getCurrentUser();
      if (user?.role !== "ADMIN") return json("Admin access required", "FORBIDDEN", 403);
      const v = await prisma.video.findUnique({ where: { id }, select: { thumbCandidates: true } });
      const list = Array.isArray(v?.thumbCandidates) ? (v.thumbCandidates as unknown[]) : [];
      const rel = list[Number(new URL(req.url).searchParams.get("i") ?? 0)];
      return typeof rel === "string" ? serveFile(req, rel, { cache: PRIVATE_CACHE }) : json("Not found", "NOT_FOUND", 404);
    }

    // ---- Subscriber-only: full video and download ----
    case "video": {
      const user = await getCurrentUser();
      if (!user) return json("Sign in required", "SESSION_EXPIRED", 401);
      if (!user.isSubscriber) return json("Subscription required", "SUBSCRIPTION_REQUIRED", 403);

      const rl = await rateLimit(`media:${user.id}:${ipFromRequest(req)}`, 1200, 300);
      if (!rl.ok)
        return new Response(JSON.stringify({ error: "Too many requests", code: "RATE_LIMITED" }), {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec), "Content-Type": "application/json" },
        });

      const v = await prisma.video.findUnique({
        where: { id },
        select: { filePath: true, status: true, slug: true },
      });
      if (!v || (v.status !== "PUBLISHED" && user.role !== "ADMIN")) return json("Not found", "NOT_FOUND", 404);

      const download = new URL(req.url).searchParams.get("download") === "1";
      const ext = v.filePath.split(".").pop() ?? "mp4";
      return serveFile(req, v.filePath, {
        cache: PRIVATE_CACHE,
        downloadName: download ? `yoyo-${v.slug}.${ext}` : undefined,
      });
    }

    default:
      return json("Not found", "NOT_FOUND", 404);
  }
}

export const HEAD = GET;
