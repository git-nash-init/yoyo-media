import "server-only";
import { createHash } from "node:crypto";
import { open, truncate } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/format";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { storage, sniffType, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/storage";
import { IngestError, type IngestAuth } from "./auth";
import {
  CHUNK_SIZE,
  KIND_RULES,
  ORPHAN_UPLOAD_MS,
  STALE_UPLOAD_MS,
  checkChunk,
  attachRenditionsSchema,
  checkRenditionUploads,
  checkUploadRequest,
  checkVideoUploads,
  createUploadSchema,
  createVideoSchema,
  isIngestKind,
  isUploadId,
  pickUniqueSlug,
  sniffMatchesKind,
} from "./rules";

const LIMITS = { maxVideoBytes: MAX_VIDEO_BYTES, maxImageBytes: MAX_IMAGE_BYTES };

function invalid(issues: { path: PropertyKey[]; message: string }[]): never {
  const first = issues[0];
  const where = first?.path.length ? `${first.path.map(String).join(".")}: ` : "";
  throw new IngestError(400, "INVALID_INPUT", `${where}${first?.message ?? "Invalid input"}`);
}

/** Serialise work on one upload inside this process (appends must never interleave). */
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  try {
    return await run;
  } finally {
    if (locks.get(key) === tail) locks.delete(key);
  }
}

async function ownedUpload(auth: IngestAuth, id: string) {
  if (!isUploadId(id)) throw new IngestError(404, "UPLOAD_NOT_FOUND", "Upload not found");
  const up = await prisma.ingestUpload.findUnique({ where: { id } });
  // Another token's upload is indistinguishable from a missing one.
  if (!up || up.tokenId !== auth.tokenId) throw new IngestError(404, "UPLOAD_NOT_FOUND", "Upload not found");
  return up;
}

async function discardUpload(id: string, tmpPath: string) {
  await storage.remove(tmpPath).catch(() => {});
  await prisma.ingestUpload.deleteMany({ where: { id } });
}

async function readHead(rel: string, bytes = 16): Promise<Buffer> {
  const fh = await open(storage.absPath(rel), "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

function hashFile(rel: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    storage
      .readStream(rel)
      .on("data", (d) => hash.update(d))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** Remove this token's abandoned uploads (rows and files). Never throws. */
export async function cleanupStaleUploads(tokenId: string) {
  try {
    const now = Date.now();
    const stale = await prisma.ingestUpload.findMany({
      where: {
        tokenId,
        OR: [
          { status: "UPLOADING", createdAt: { lt: new Date(now - STALE_UPLOAD_MS) } },
          { status: "COMPLETE", createdAt: { lt: new Date(now - ORPHAN_UPLOAD_MS) } },
        ],
      },
      select: { id: true, status: true, tmpPath: true, finalPath: true },
      take: 100,
    });
    for (const u of stale) {
      await storage.remove(u.tmpPath).catch(() => {});
      if (u.status === "COMPLETE") await storage.remove(u.finalPath).catch(() => {});
    }
    if (stale.length) {
      // Status is re-checked so an upload that was consumed meanwhile is left alone.
      await prisma.ingestUpload.deleteMany({
        where: { id: { in: stale.map((u) => u.id) }, status: { in: ["UPLOADING", "COMPLETE"] } },
      });
      log.info("ingest stale uploads removed", { count: stale.length });
    }
  } catch (e) {
    log.warn("ingest cleanup failed", { error: e });
  }
}

export function pingInfo(auth: IngestAuth) {
  return { ok: true, tokenName: auth.tokenName, maxVideoBytes: MAX_VIDEO_BYTES, maxImageBytes: MAX_IMAGE_BYTES, chunkSize: CHUNK_SIZE };
}

export async function startUpload(auth: IngestAuth, body: unknown) {
  const parsed = createUploadSchema.safeParse(body);
  if (!parsed.success) invalid(parsed.error.issues);
  const input = parsed.data;
  const check = checkUploadRequest(input, LIMITS);
  if (!check.ok) throw new IngestError(check.status, check.code, check.error);

  await cleanupStaleUploads(auth.tokenId);
  await storage.ensureDir("tmp");

  const up = await prisma.ingestUpload.create({
    data: {
      tokenId: auth.tokenId,
      kind: input.kind,
      filename: input.filename,
      totalSize: BigInt(input.totalSize),
      sha256: input.sha256,
      // Server-generated name; the client's filename is never used on disk.
      tmpPath: `tmp/${randomToken(16)}.part`,
    },
    select: { id: true },
  });
  return { uploadId: up.id, chunkSize: CHUNK_SIZE, received: 0 };
}

export async function getUpload(auth: IngestAuth, id: string) {
  const up = await ownedUpload(auth, id);
  return { uploadId: up.id, kind: up.kind, received: Number(up.received), totalSize: Number(up.totalSize), status: up.status };
}

export async function appendChunk(
  auth: IngestAuth,
  id: string,
  offset: number,
  chunk: Buffer,
  chunkSha256: string | null,
) {
  return withLock(id, async () => {
    const up = await ownedUpload(auth, id);
    const totalSize = Number(up.totalSize);
    let received = Number(up.received);
    if (up.status !== "UPLOADING" || !isIngestKind(up.kind))
      throw new IngestError(409, "NOT_UPLOADING", "This upload is already finished", { received, status: up.status });

    // The file on disk is the truth. Repair any drift left by a crash mid-request.
    const onDisk = (await storage.size(up.tmpPath)) ?? 0;
    if (onDisk > received) {
      await truncate(storage.absPath(up.tmpPath), received);
    } else if (onDisk < received) {
      received = onDisk;
      await prisma.ingestUpload.update({ where: { id }, data: { received: BigInt(received) } });
    }

    const check = checkChunk({ offset, received, totalSize, chunkLength: chunk.length });
    if (!check.ok) throw new IngestError(check.status, check.code, check.error, { received });

    if (chunkSha256 && sha256(chunk) !== chunkSha256.toLowerCase())
      throw new IngestError(422, "CHUNK_HASH_MISMATCH", "The chunk was damaged in transit, send it again", { received });

    if (offset === 0 && !sniffMatchesKind(up.kind, sniffType(chunk.subarray(0, 16)))) {
      await discardUpload(id, up.tmpPath);
      throw new IngestError(415, "BAD_FILE_TYPE", `The file content is not a valid ${up.kind} file`);
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const out = storage.appendStream(up.tmpPath);
        out.on("error", reject);
        out.on("finish", resolve);
        out.end(chunk);
      });
    } catch (e) {
      await truncate(storage.absPath(up.tmpPath), received).catch(() => {});
      throw e;
    }

    const next = offset + chunk.length;
    // Conditional update guards against another server process touching the same upload.
    const res = await prisma.ingestUpload.updateMany({
      where: { id, status: "UPLOADING", received: BigInt(offset) },
      data: { received: BigInt(next) },
    });
    if (res.count !== 1) {
      const now = await prisma.ingestUpload.findUnique({ where: { id }, select: { received: true } });
      throw new IngestError(409, "OFFSET_MISMATCH", "Upload position changed, resync and retry", {
        received: Number(now?.received ?? 0),
      });
    }
    return { received: next, totalSize };
  });
}

export async function completeUpload(auth: IngestAuth, id: string) {
  return withLock(id, async () => {
    const up = await ownedUpload(auth, id);
    const totalSize = Number(up.totalSize);
    // Idempotent: Studio may retry after a lost response.
    if (up.status !== "UPLOADING") return { uploadId: up.id, status: up.status, size: totalSize };
    if (!isIngestKind(up.kind)) throw new IngestError(409, "NOT_UPLOADING", "Upload is in an invalid state");

    const received = Number(up.received);
    if (received !== totalSize)
      throw new IngestError(409, "UPLOAD_INCOMPLETE", "Not all bytes have been received yet", { received, totalSize });

    const onDisk = (await storage.size(up.tmpPath)) ?? 0;
    if (onDisk !== totalSize) {
      const fixed = Math.min(onDisk, totalSize);
      if (onDisk > totalSize) await truncate(storage.absPath(up.tmpPath), totalSize);
      if (fixed !== totalSize) {
        await prisma.ingestUpload.update({ where: { id }, data: { received: BigInt(fixed) } });
        throw new IngestError(409, "UPLOAD_INCOMPLETE", "Part of the upload is missing, resume it", {
          received: fixed,
          totalSize,
        });
      }
    }

    const actual = await hashFile(up.tmpPath);
    if (actual !== up.sha256.toLowerCase()) {
      await discardUpload(id, up.tmpPath);
      throw new IngestError(422, "HASH_MISMATCH", "The uploaded file does not match its SHA-256, upload it again");
    }

    const type = sniffType(await readHead(up.tmpPath));
    if (!type || !sniffMatchesKind(up.kind, type)) {
      await discardUpload(id, up.tmpPath);
      throw new IngestError(415, "BAD_FILE_TYPE", `The file content is not a valid ${up.kind} file`);
    }

    // Final name and extension come from the server (sniffed type), not the client.
    const finalPath = await storage.move(up.tmpPath, KIND_RULES[up.kind].folder, type.ext);
    try {
      await prisma.ingestUpload.update({ where: { id }, data: { status: "COMPLETE", finalPath } });
    } catch (e) {
      await storage.remove(finalPath).catch(() => {});
      throw e;
    }
    return { uploadId: up.id, status: "COMPLETE", size: totalSize };
  });
}

export async function createVideoFromUploads(auth: IngestAuth, body: unknown) {
  const parsed = createVideoSchema.safeParse(body);
  if (!parsed.success) invalid(parsed.error.issues);
  const input = parsed.data;

  const ids = [
    input.videoUploadId,
    ...(input.previewUploadId ? [input.previewUploadId] : []),
    ...input.thumbUploadIds,
    ...input.renditions.map((r) => r.uploadId),
  ];
  const uploads = await prisma.ingestUpload.findMany({
    where: { id: { in: ids }, tokenId: auth.tokenId },
    select: { id: true, tokenId: true, kind: true, status: true, finalPath: true, totalSize: true },
  });
  const check = checkVideoUploads(input, uploads, auth.tokenId);
  if (!check.ok) throw new IngestError(check.status, check.code, check.error);

  const byId = new Map(uploads.map((u) => [u.id, u]));
  const videoUp = byId.get(input.videoUploadId)!;
  if ((await storage.size(videoUp.finalPath!)) == null)
    throw new IngestError(409, "UPLOAD_INCOMPLETE", "The uploaded video file is missing, upload it again");
  const thumbs = input.thumbUploadIds.map((id) => byId.get(id)!.finalPath!);
  const previewPath = input.previewUploadId ? byId.get(input.previewUploadId)!.finalPath! : null;
  const renditions = input.renditions.map((r) => {
    const up = byId.get(r.uploadId)!;
    return { height: r.height, filePath: up.finalPath!, sizeBytes: up.totalSize };
  });

  const base = slugify(input.title);
  for (let attempt = 0; ; attempt++) {
    const slug = await pickUniqueSlug(
      base,
      async (s) => (await prisma.video.count({ where: { slug: s } })) > 0,
      () => randomToken(6),
    );
    try {
      const video = await prisma.$transaction(async (tx) => {
        // Claiming the uploads inside the transaction makes each usable exactly once.
        const claimed = await tx.ingestUpload.updateMany({
          where: { id: { in: ids }, tokenId: auth.tokenId, status: "COMPLETE" },
          data: { status: "CONSUMED" },
        });
        if (claimed.count !== ids.length)
          throw new IngestError(409, "UPLOAD_CONSUMED", "One of the uploads was already used for a video");
        return tx.video.create({
          data: {
            slug,
            title: input.title,
            description: input.description || null,
            type: input.type,
            status: "DRAFT",
            filePath: videoUp.finalPath!,
            sizeBytes: videoUp.totalSize,
            durationSec: input.durationSec,
            heightPx: input.heightPx,
            previewPath,
            thumbCandidates: thumbs,
            thumbPath: thumbs[0] ?? null,
            ...(renditions.length ? { renditions: { create: renditions } } : {}),
          },
          select: { id: true, slug: true },
        });
      });
      await audit(null, "ingest.video.create", video.id, { tokenName: auth.tokenName, tokenId: auth.tokenId });
      return { videoId: video.id, slug: video.slug, adminUrl: `/admin/videos/${video.id}` };
    } catch (e) {
      // Slug taken between the check and the insert: pick another one.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 3) continue;
      throw e;
    }
  }
}

/** Studio's backfill: find videos by title so lower qualities can be added to ones already on the site. */
export async function findVideosByTitle(title: string) {
  const t = title.trim().slice(0, 150);
  if (!t) throw new IngestError(400, "INVALID_INPUT", "title is required");
  const rows = await prisma.video.findMany({
    // MySQL's default collation ignores case, which is what we want here.
    where: { title: t },
    select: { id: true, slug: true, title: true, type: true, durationSec: true, heightPx: true, _count: { select: { renditions: true } } },
    take: 10,
  });
  return {
    videos: rows.map((v) => ({
      id: v.id,
      slug: v.slug,
      title: v.title,
      type: v.type,
      durationSec: v.durationSec,
      heightPx: v.heightPx,
      renditionCount: v._count.renditions,
    })),
  };
}

/** Attach lower-quality copies (already uploaded and completed) to an existing video. */
export async function attachRenditions(auth: IngestAuth, videoId: string, body: unknown) {
  const parsed = attachRenditionsSchema.safeParse(body);
  if (!parsed.success) invalid(parsed.error.issues);
  const input = parsed.data;
  if (!isUploadId(videoId)) throw new IngestError(404, "VIDEO_NOT_FOUND", "Video not found");

  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { id: true, heightPx: true } });
  if (!video) throw new IngestError(404, "VIDEO_NOT_FOUND", "Video not found");

  const ids = input.renditions.map((r) => r.uploadId);
  const uploads = await prisma.ingestUpload.findMany({
    where: { id: { in: ids }, tokenId: auth.tokenId },
    select: { id: true, tokenId: true, kind: true, status: true, finalPath: true, totalSize: true },
  });
  const check = checkRenditionUploads(input.renditions, uploads, auth.tokenId);
  if (!check.ok) throw new IngestError(check.status, check.code, check.error);
  const byId = new Map(uploads.map((u) => [u.id, u]));

  const replaced: string[] = [];
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.ingestUpload.updateMany({
      where: { id: { in: ids }, tokenId: auth.tokenId, status: "COMPLETE" },
      data: { status: "CONSUMED" },
    });
    if (claimed.count !== ids.length) throw new IngestError(409, "UPLOAD_CONSUMED", "One of the uploads was already used");
    for (const r of input.renditions) {
      const up = byId.get(r.uploadId)!;
      const existing = await tx.videoRendition.findUnique({
        where: { videoId_height: { videoId, height: r.height } },
        select: { filePath: true },
      });
      if (existing) replaced.push(existing.filePath);
      await tx.videoRendition.upsert({
        where: { videoId_height: { videoId, height: r.height } },
        create: { videoId, height: r.height, filePath: up.finalPath!, sizeBytes: up.totalSize },
        update: { filePath: up.finalPath!, sizeBytes: up.totalSize },
      });
    }
    // Only fill in the main file's height when it was never recorded.
    if (video.heightPx === 0 && input.heightPx > 0) await tx.video.update({ where: { id: videoId }, data: { heightPx: input.heightPx } });
  });
  for (const rel of replaced) await storage.remove(rel).catch(() => {});
  await audit(null, "ingest.video.renditions", videoId, { tokenName: auth.tokenName, tokenId: auth.tokenId, count: input.renditions.length });
  return { videoId, added: input.renditions.map((r) => r.height) };
}
