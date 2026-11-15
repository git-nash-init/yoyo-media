import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Storage layer. All media lives under STORAGE_DIR, outside the public web root,
 * and is only reachable through /api/media (which enforces entitlement).
 * Callers deal in *relative* paths such as "videos/ab12.mp4"; swap this driver
 * to move to another backend without touching callers.
 */
export type StorageKind = "videos" | "previews" | "thumbs" | "images" | "tmp";

const ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), env.STORAGE_DIR);

function abs(rel: string): string {
  const full = path.resolve(ROOT, rel);
  // Path traversal guard: the resolved path must stay inside ROOT.
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) throw new Error("Invalid storage path");
  return full;
}

/** Server-generated random filename; user-supplied names are never used on disk. */
export function newRelPath(kind: StorageKind, ext: string): string {
  const clean = ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5);
  return `${kind}/${randomBytes(16).toString("hex")}.${clean}`;
}

export const storage = {
  root: ROOT,
  absPath: abs,

  async saveBuffer(kind: StorageKind, data: Buffer, ext: string): Promise<string> {
    const rel = newRelPath(kind, ext);
    await mkdir(path.dirname(abs(rel)), { recursive: true });
    await writeFile(abs(rel), data);
    return rel;
  },

  /** Move a file already inside storage (e.g. a finished tmp upload) to its final place. */
  async move(fromRel: string, kind: StorageKind, ext: string): Promise<string> {
    const rel = newRelPath(kind, ext);
    await mkdir(path.dirname(abs(rel)), { recursive: true });
    await rename(abs(fromRel), abs(rel));
    return rel;
  },

  async ensureDir(kind: StorageKind) {
    await mkdir(abs(kind), { recursive: true });
  },

  appendStream(rel: string) {
    return createWriteStream(abs(rel), { flags: "a" });
  },

  readStream(rel: string, range?: { start: number; end: number }) {
    return createReadStream(abs(rel), range);
  },

  async size(rel: string): Promise<number | null> {
    try {
      return (await stat(abs(rel))).size;
    } catch {
      return null;
    }
  },

  async remove(rel: string | null | undefined) {
    if (!rel) return;
    await rm(abs(rel), { force: true });
  },

  /** Total bytes used, for the admin dashboard (plan has a 50 GB cap). */
  async usage(): Promise<number> {
    let total = 0;
    for (const kind of ["videos", "previews", "thumbs", "images"] as const) {
      try {
        for (const f of await readdir(abs(kind))) total += (await stat(path.join(abs(kind), f))).size;
      } catch {
        /* folder not created yet */
      }
    }
    return total;
  },
};

/** Detect real file type from magic bytes; returns null if not an allowed type. */
export function sniffType(head: Buffer): { ext: string; mime: string; group: "image" | "video" } | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return { ext: "jpg", mime: "image/jpeg", group: "image" };
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { ext: "png", mime: "image/png", group: "image" };
  if (head.length >= 12 && head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP")
    return { ext: "webp", mime: "image/webp", group: "image" };
  if (head.length >= 12 && head.subarray(4, 8).toString() === "ftyp")
    return { ext: "mp4", mime: "video/mp4", group: "video" };
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3)
    return { ext: "webm", mime: "video/webm", group: "video" };
  return null;
}

export const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;

/**
 * Validate and store an uploaded image (thumbnail, logo, photo, poster).
 * Returns the relative storage path, or an error message.
 */
export async function saveUploadedImage(
  file: File,
  kind: "thumbs" | "images",
): Promise<{ path: string } | { error: string }> {
  if (file.size === 0) return { error: "The file is empty." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Image must be 5 MB or smaller." };
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffType(buf.subarray(0, 16));
  if (!type || type.group !== "image") return { error: "Only JPG, PNG or WebP images are allowed." };
  return { path: await storage.saveBuffer(kind, buf, type.ext) };
}
