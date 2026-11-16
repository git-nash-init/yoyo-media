// Pure config helpers (no fs): .env parsing and turning raw values into a typed config.
import path from "node:path";

export type StudioConfig = {
  siteUrl: string;
  token: string;
  dir: string;
  maxHeight: number;
  /** Extra lower qualities to make for long videos (short side in pixels), best first. */
  qualities: number[];
  crf: number;
  keepOriginals: boolean;
  ffmpegPath: string;
  ffprobePath: string;
};

/** Minimal .env parser: KEY=value lines, # comments, optional quotes, optional `export`. */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    } else {
      // Unquoted: a " #" starts a trailing comment.
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[m[1]] = value;
  }
  return out;
}

/** "480, 360" -> [480, 360]. Bad entries are dropped; "none" or "off" means no extra qualities. */
export function parseQualityList(value: string | undefined, fallback: number[]): number[] {
  if (value == null || value.trim() === "") return fallback;
  if (["none", "off", "no", "0"].includes(value.trim().toLowerCase())) return [];
  const out = new Set<number>();
  for (const part of value.split(/[\s,;]+/)) {
    const m = /^(\d{3,4})p?$/i.exec(part.trim());
    if (m && Number(m[1]) >= 144 && Number(m[1]) <= 2160) out.add(Number(m[1]));
  }
  return out.size ? [...out].sort((a, b) => b - a).slice(0, 4) : fallback;
}

export function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

export function parseIntInRange(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value == null || !/^\s*\d+\s*$/.test(value)) return fallback;
  const n = Number(value);
  return n < min || n > max ? fallback : n;
}

/** Normalise the site URL: must be http(s); trailing slashes and paths are dropped. */
export function normalizeSiteUrl(raw: string | undefined): string | null {
  const value = (raw ?? "").trim() || "http://localhost:3000";
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin + u.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** True when the token would travel unencrypted to a machine other than this one. */
export function isInsecureRemote(siteUrl: string): boolean {
  const u = new URL(siteUrl);
  return u.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
}

/**
 * Build the config. `fileEnv` is tools/studio/.env; real environment variables win
 * so a single run can be redirected (e.g. STUDIO_DIR=... npm run studio).
 */
export function buildConfig(
  fileEnv: Record<string, string>,
  procEnv: Record<string, string | undefined>,
  repoRoot: string,
): { config: StudioConfig; problems: string[] } {
  const get = (k: string) => {
    const p = procEnv[k];
    return p != null && p !== "" ? p : fileEnv[k];
  };
  const problems: string[] = [];
  const siteUrl = normalizeSiteUrl(get("STUDIO_SITE_URL"));
  if (!siteUrl) problems.push(`STUDIO_SITE_URL is not a valid http(s) address: "${get("STUDIO_SITE_URL")}"`);
  const dirRaw = (get("STUDIO_DIR") ?? "").trim();
  return {
    problems,
    config: {
      siteUrl: siteUrl ?? "http://localhost:3000",
      token: (get("STUDIO_TOKEN") ?? "").trim(),
      dir: dirRaw ? path.resolve(repoRoot, dirRaw) : path.join(repoRoot, "studio"),
      maxHeight: parseIntInRange(get("STUDIO_MAX_HEIGHT"), 720, 144, 2160),
      qualities: parseQualityList(get("STUDIO_QUALITIES"), [480, 360]),
      crf: parseIntInRange(get("STUDIO_CRF"), 23, 0, 51),
      keepOriginals: parseBool(get("STUDIO_KEEP_ORIGINALS"), true),
      ffmpegPath: (get("FFMPEG_PATH") ?? "").trim() || "ffmpeg",
      ffprobePath: (get("FFPROBE_PATH") ?? "").trim() || "ffprobe",
    },
  };
}

export type CliFlags = { once: boolean; dryRun: boolean; backfill: boolean; help: boolean; unknown: string[] };

export function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { once: false, dryRun: false, backfill: false, help: false, unknown: [] };
  for (const a of argv) {
    if (a === "--once") flags.once = true;
    else if (a === "--dry-run" || a === "--dryrun") flags.dryRun = true;
    else if (a === "--backfill") flags.backfill = true;
    else if (a === "--help" || a === "-h") flags.help = true;
    else flags.unknown.push(a);
  }
  return flags;
}
