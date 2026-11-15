import "server-only";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { log } from "@/lib/logger";
import { slugCandidate } from "@/lib/admin/logic";

export type SlugKind = "video" | "channel" | "model" | "series";

/** Is this slug already used by another row of the same kind? */
export async function slugTaken(kind: SlugKind, slug: string, excludeId?: string | null): Promise<boolean> {
  const where = { slug, ...(excludeId ? { id: { not: excludeId } } : {}) };
  switch (kind) {
    case "video":
      return (await prisma.video.count({ where })) > 0;
    case "channel":
      return (await prisma.channel.count({ where })) > 0;
    case "model":
      return (await prisma.model.count({ where })) > 0;
    case "series":
      return (await prisma.series.count({ where })) > 0;
  }
}

/** Find a free slug by appending -2, -3, ... to the base. */
export async function uniqueSlug(kind: SlugKind, base: string, excludeId?: string | null): Promise<string> {
  for (let n = 0; n < 200; n++) {
    const candidate = slugCandidate(base, n);
    if (!(await slugTaken(kind, candidate, excludeId))) return candidate;
  }
  return slugCandidate(base, Date.now() % 1_000_000);
}

/** Candidate thumbnail paths stored as JSON on the video. */
export function candidateList(json: unknown): string[] {
  return Array.isArray(json) ? json.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

/** Best-effort file removal: a missing or locked file must never fail the admin action. */
export async function removeFileQuietly(rel: string | null | undefined) {
  if (!rel) return;
  try {
    await storage.remove(rel);
  } catch (e) {
    log.warn("storage remove failed", { rel, error: e });
  }
}

/** Remove every file that belongs to a video (main file, preview, thumbnail, candidates). */
export async function removeVideoFiles(v: {
  filePath: string;
  previewPath: string | null;
  thumbPath: string | null;
  thumbCandidates: unknown;
}) {
  const paths = new Set<string>([v.filePath, ...candidateList(v.thumbCandidates)]);
  if (v.previewPath) paths.add(v.previewPath);
  if (v.thumbPath) paths.add(v.thumbPath);
  for (const p of paths) await removeFileQuietly(p);
}

/** Read an optional image upload from a form; empty file inputs come through as a zero-byte File. */
export function formFile(fd: FormData, key: string): File | null {
  const f = fd.get(key);
  return f instanceof File && f.size > 0 ? f : null;
}

export function formText(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" ? v : undefined;
}
