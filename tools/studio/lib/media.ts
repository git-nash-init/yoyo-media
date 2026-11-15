// Pure media decisions: probe parsing, title cleaning, type, scaling, timings. No fs, no spawn.

export const VIDEO_EXTENSIONS = [
  "mp4", "mov", "m4v", "mkv", "webm", "avi", "wmv", "flv", "mpg", "mpeg", "3gp", "mts", "m2ts", "ts", "ogv",
] as const;

/** Above this bitrate an already-compatible MP4 is re-encoded instead of remuxed. */
export const REMUX_MAX_KBPS = 6000;
export const SHORT_MAX_SEC = 90;
export const PREVIEW_SEC = 8;

export type VideoType = "LONG" | "SHORT";

export type MediaInfo = {
  durationSec: number;
  /** Displayed size, i.e. after applying rotation metadata. */
  width: number;
  height: number;
  rotation: number;
  videoCodec: string;
  pixFmt: string;
  audioCodec: string | null;
  formatName: string;
  bitrateKbps: number | null;
};

export function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function isVideoFile(name: string): boolean {
  return (VIDEO_EXTENSIONS as readonly string[]).includes(fileExt(name));
}

export function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? name : name.slice(0, i);
}

/** "my_holiday-video.final.mp4" -> "My Holiday Video Final" */
export function cleanTitle(filename: string): string {
  const words = baseName(filename)
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.join(" ").slice(0, 150).trim() || "Untitled Video";
}

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  duration?: string;
  bit_rate?: string;
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number | string }[];
  disposition?: { attached_pic?: number };
};
type ProbeJson = {
  streams?: ProbeStream[];
  format?: { duration?: string; format_name?: string; bit_rate?: string };
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : NaN;
};

/** Turn `ffprobe -print_format json -show_format -show_streams` output into MediaInfo. */
export function parseProbe(json: unknown): { ok: true; info: MediaInfo } | { ok: false; reason: string } {
  const p = (json ?? {}) as ProbeJson;
  const streams = Array.isArray(p.streams) ? p.streams : [];
  // Cover art in audio files shows up as a "video" stream; it does not count.
  const v = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  if (!v) return { ok: false, reason: "This file has no video stream (it may be audio only or not a video at all)." };
  const w = num(v.width);
  const h = num(v.height);
  if (!(w > 0) || !(h > 0)) return { ok: false, reason: "Could not read the video's width and height." };

  let duration = num(p.format?.duration);
  if (!(duration > 0)) duration = num(v.duration);
  if (!(duration > 0)) return { ok: false, reason: "Could not read the video's duration (the file may be damaged or incomplete)." };

  let rotation = NaN;
  for (const sd of v.side_data_list ?? []) if (sd.rotation != null) rotation = num(sd.rotation);
  if (!Number.isFinite(rotation)) rotation = num(v.tags?.rotate);
  if (!Number.isFinite(rotation)) rotation = 0;
  rotation = ((Math.round(rotation) % 360) + 360) % 360;
  const swap = rotation === 90 || rotation === 270;

  const a = streams.find((s) => s.codec_type === "audio");
  const bitrate = num(p.format?.bit_rate);
  return {
    ok: true,
    info: {
      durationSec: duration,
      width: swap ? h : w,
      height: swap ? w : h,
      rotation,
      videoCodec: v.codec_name ?? "",
      pixFmt: v.pix_fmt ?? "",
      audioCodec: a ? (a.codec_name ?? "") : null,
      formatName: p.format?.format_name ?? "",
      bitrateKbps: bitrate > 0 ? Math.round(bitrate / 1000) : null,
    },
  };
}

/** SHORT = portrait and at most 90 seconds; everything else is LONG. */
export function decideType(width: number, height: number, durationSec: number): VideoType {
  return height > width && durationSec <= SHORT_MAX_SEC ? "SHORT" : "LONG";
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Output size. Landscape/square: height capped at maxHeight. Portrait: the long side is
 * capped at maxHeight*16/9 (1280 for 720). Never upscales; both sides are even.
 */
export function computeScale(
  width: number,
  height: number,
  maxHeight: number,
): { width: number; height: number; scaled: boolean } {
  const portrait = height > width;
  const cap = portrait ? even((maxHeight * 16) / 9) : even(maxHeight);
  if (height <= cap) {
    const w = even(width);
    const h = even(height);
    return { width: w, height: h, scaled: w !== width || h !== height };
  }
  return { width: even((width * cap) / height), height: cap, scaled: true };
}

/** Is the display size already within the limits computeScale would enforce? */
export function withinSizeLimit(width: number, height: number, maxHeight: number): boolean {
  const s = computeScale(width, height, maxHeight);
  return s.width === width && s.height === height;
}

/** Can we just rewrite the container (fast, lossless) instead of re-encoding? */
export function canRemux(info: MediaInfo, filename: string, maxHeight: number): boolean {
  return (
    fileExt(filename) === "mp4" &&
    info.formatName.split(",").includes("mp4") &&
    info.videoCodec === "h264" &&
    info.pixFmt === "yuv420p" &&
    (info.audioCodec === null || info.audioCodec === "aac") &&
    info.rotation === 0 &&
    withinSizeLimit(info.width, info.height, maxHeight) &&
    info.bitrateKbps !== null &&
    info.bitrateKbps <= REMUX_MAX_KBPS
  );
}

/** Thumbnail timestamps at ~10 %, 35 % and 60 % of the duration. */
export function thumbTimes(durationSec: number): number[] {
  const last = Math.max(0, durationSec - 0.1);
  return [0.1, 0.35, 0.6].map((f) => round2(Math.min(durationSec * f, last)));
}

/** Preview clip: 8 s starting ~15 % in; shorter and shifted back when the video is short. */
export function previewWindow(durationSec: number): { start: number; length: number } {
  const length = Math.min(PREVIEW_SEC, Math.max(0.5, durationSec));
  const start = Math.max(0, Math.min(durationSec * 0.15, durationSec - length));
  return { start: round2(start), length: round2(length) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type Sidecar = { title?: string; description?: string; type?: VideoType };

/** Parse the optional `<basename>.json` overrides; unknown or bad fields are ignored. */
export function parseSidecar(text: string): { sidecar: Sidecar; warnings: string[] } {
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { sidecar: {}, warnings: ["it is not valid JSON, so it was ignored"] };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { sidecar: {}, warnings: ["it must be a JSON object like { \"title\": \"...\" }, so it was ignored"] };
  const o = raw as Record<string, unknown>;
  const sidecar: Sidecar = {};
  if (typeof o.title === "string" && o.title.trim()) sidecar.title = o.title.trim().slice(0, 150);
  else if (o.title != null) warnings.push('"title" must be non-empty text');
  if (typeof o.description === "string") sidecar.description = o.description.trim().slice(0, 5000);
  else if (o.description != null) warnings.push('"description" must be text');
  if (typeof o.type === "string" && ["LONG", "SHORT"].includes(o.type.toUpperCase()))
    sidecar.type = o.type.toUpperCase() as VideoType;
  else if (o.type != null) warnings.push('"type" must be "LONG" or "SHORT"');
  return { sidecar, warnings };
}
