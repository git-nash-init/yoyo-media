import type { WriteStream } from "node:fs";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { apiAdmin } from "@/lib/auth/guards";
import { forbidCrossOrigin } from "@/lib/security/origin";
import { newRelPath, sniffType, storage } from "@/lib/storage";
import { MAX_SMALL_UPLOAD_BYTES, STORAGE_CAP_BYTES, normalizeSlug, uploadMetaSchema } from "@/lib/admin/logic";
import { removeFileQuietly, uniqueSlug } from "@/lib/admin/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail = (status: number, error: string, code: string) => Response.json({ error, code }, { status });

function writeChunk(ws: WriteStream, buf: Buffer) {
  // Resolving on the write callback gives natural backpressure: we do not read more until this chunk is flushed.
  return new Promise<void>((resolve, reject) => ws.write(buf, (err) => (err ? reject(err) : resolve())));
}

/** Wait until the file handle is really closed (needed on Windows before rename/delete). */
function closeStream(ws: WriteStream, graceful: boolean) {
  return new Promise<void>((resolve) => {
    if (ws.closed) return resolve();
    ws.once("close", () => resolve());
    if (graceful) ws.end();
    else ws.destroy();
  });
}

/**
 * Fallback small-file upload (admin only). The browser sends the raw file as the
 * request body; metadata travels in the query string:
 *   POST /api/admin/upload?title=...&type=LONG|SHORT&duration=123
 * Creates a DRAFT video and returns { id }.
 */
export async function POST(req: Request) {
  const blocked = forbidCrossOrigin(req);
  if (blocked) return blocked;
  const admin = await apiAdmin();
  if (admin instanceof Response) return admin;

  const sp = new URL(req.url).searchParams;
  const meta = uploadMetaSchema.safeParse({
    title: sp.get("title") ?? "",
    type: sp.get("type") ?? "",
    duration: sp.get("duration") ?? "0",
  });
  if (!meta.success) return fail(400, meta.error.issues[0]?.message ?? "Invalid upload details.", "BAD_REQUEST");

  const declared = Number(req.headers.get("content-length"));
  if (!Number.isInteger(declared) || declared <= 0) {
    return fail(411, "The upload did not say how big the file is. Try again from the upload page.", "LENGTH_REQUIRED");
  }
  if (declared > MAX_SMALL_UPLOAD_BYTES) {
    return fail(413, "This file is over the 500 MB limit for browser uploads. Use YoYo Studio for bigger files.", "TOO_LARGE");
  }
  if ((await storage.usage()) + declared > STORAGE_CAP_BYTES) {
    return fail(507, "Not enough storage left for this file. Delete unused videos first.", "STORAGE_FULL");
  }
  if (!req.body) return fail(400, "The upload was empty.", "EMPTY");

  await storage.ensureDir("tmp");
  const tmpRel = newRelPath("tmp", "part");
  const ws = storage.appendStream(tmpRel);
  let streamError: unknown = null;
  ws.on("error", (e) => {
    streamError = e;
  });

  const reader = req.body.getReader();
  let received = 0;
  let head: Buffer | null = Buffer.alloc(0);
  let type: ReturnType<typeof sniffType> = null;
  let rejection: Response | null = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (streamError) throw streamError;
      const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      received += chunk.length;

      // Enforce the cap on bytes actually received; never trust Content-Length alone.
      if (received > MAX_SMALL_UPLOAD_BYTES || received > declared) {
        rejection = fail(413, "This file is over the 500 MB limit for browser uploads. Use YoYo Studio for bigger files.", "TOO_LARGE");
        break;
      }

      if (head !== null) {
        // Hold back the first bytes until the real file type is known (magic bytes, not the file name).
        head = Buffer.concat([head, chunk]);
        if (head.length < 16) continue;
        type = sniffType(head.subarray(0, 16));
        if (!type || type.group !== "video") {
          rejection = fail(415, "This is not an MP4 or WebM video. Export the video as MP4 (H.264) and try again.", "BAD_TYPE");
          break;
        }
        await writeChunk(ws, head);
        head = null;
      } else {
        await writeChunk(ws, chunk);
      }
    }
  } catch (e) {
    await closeStream(ws, false);
    await removeFileQuietly(tmpRel);
    log.warn("admin upload interrupted", { received, declared, error: e });
    return fail(400, "The upload was interrupted before it finished. Check your connection and try again.", "INTERRUPTED");
  }

  if (!rejection && !type) rejection = fail(415, "This file is too small to be a video.", "BAD_TYPE");
  if (!rejection && received !== declared) {
    rejection = fail(400, "The upload was cut short. Check your connection and try again.", "INTERRUPTED");
  }
  if (rejection || !type) {
    await reader.cancel().catch(() => {});
    await closeStream(ws, false);
    await removeFileQuietly(tmpRel);
    return rejection ?? fail(415, "Unsupported file.", "BAD_TYPE");
  }

  await closeStream(ws, true);
  if (streamError) {
    await removeFileQuietly(tmpRel);
    log.error("admin upload write failed", { error: streamError });
    return fail(500, "The server could not save the file. Try again in a minute.", "WRITE_FAILED");
  }

  let filePath: string | null = null;
  try {
    filePath = await storage.move(tmpRel, "videos", type.ext);
    const slug = await uniqueSlug("video", normalizeSlug(meta.data.title));
    const video = await prisma.video.create({
      data: {
        title: meta.data.title,
        slug,
        type: meta.data.type,
        status: "DRAFT",
        filePath,
        sizeBytes: BigInt(received),
        durationSec: Math.round(meta.data.duration),
      },
      select: { id: true, slug: true },
    });
    await audit(admin.id, "video.upload", `video:${video.id}`, { sizeBytes: received, type: meta.data.type, format: type.ext });
    return Response.json({ ok: true, id: video.id, slug: video.slug }, { status: 201 });
  } catch (e) {
    await removeFileQuietly(filePath ?? tmpRel);
    log.error("admin upload finalize failed", { error: e });
    return fail(500, "The file arrived but could not be saved as a video. Try again in a minute.", "SAVE_FAILED");
  }
}
