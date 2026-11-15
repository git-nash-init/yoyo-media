// Pure ffmpeg/ffprobe argument builders. Always argument arrays, never shell strings,
// so file names with spaces, quotes or & are passed through untouched.

const COMMON = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error"];
const PROGRESS = ["-progress", "pipe:1", "-nostats"];

export function probeArgs(input: string): string[] {
  return ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", input];
}

/** Re-encode to H.264/AAC MP4 with faststart. Rotation metadata is applied by ffmpeg automatically. */
export function transcodeArgs(p: { input: string; output: string; width: number; height: number; crf: number }): string[] {
  return [
    ...COMMON,
    "-i", p.input,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-sn", "-dn",
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    "-vf", `scale=${p.width}:${p.height}:flags=lanczos,setsar=1`,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", String(p.crf),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ac", "2",
    "-movflags", "+faststart",
    ...PROGRESS,
    "-f", "mp4",
    p.output,
  ];
}

/** Already H.264/AAC MP4 within limits: copy streams, just move the index to the front. */
export function remuxArgs(p: { input: string; output: string }): string[] {
  return [
    ...COMMON,
    "-i", p.input,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-sn", "-dn",
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    "-c", "copy",
    "-movflags", "+faststart",
    ...PROGRESS,
    "-f", "mp4",
    p.output,
  ];
}

/** One JPEG frame at `atSec`, at most `maxWidth` wide (never upscaled). */
export function thumbArgs(p: { input: string; output: string; atSec: number; maxWidth: number }): string[] {
  return [
    ...COMMON,
    "-ss", p.atSec.toFixed(2),
    "-i", p.input,
    "-frames:v", "1",
    "-an",
    "-vf", `scale=w='min(${p.maxWidth},iw)':h=-2:flags=lanczos`,
    "-q:v", "3",
    "-f", "image2",
    "-update", "1",
    p.output,
  ];
}

/** Short muted preview clip, 480 px high (never upscaled), small bitrate, faststart. */
export function previewArgs(p: { input: string; output: string; startSec: number; lengthSec: number }): string[] {
  return [
    ...COMMON,
    "-ss", p.startSec.toFixed(2),
    "-i", p.input,
    "-t", p.lengthSec.toFixed(2),
    "-map", "0:v:0",
    "-an", "-sn", "-dn",
    "-map_metadata", "-1",
    "-vf", "scale=w=-2:h='min(480,ih)':flags=lanczos,setsar=1",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "30",
    "-maxrate", "600k",
    "-bufsize", "1200k",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-f", "mp4",
    p.output,
  ];
}

/**
 * Parse one line of `-progress pipe:1` output. Returns seconds encoded so far,
 * "end" when ffmpeg reports completion, or null for other lines.
 */
export function parseProgressLine(line: string): number | "end" | null {
  const i = line.indexOf("=");
  if (i < 0) return null;
  const key = line.slice(0, i).trim();
  const value = line.slice(i + 1).trim();
  if (key === "progress") return value === "end" ? "end" : null;
  // Both out_time_us and (despite its name) out_time_ms are in microseconds.
  if (key === "out_time_us" || key === "out_time_ms") {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n / 1_000_000 : null;
  }
  if (key === "out_time") {
    const m = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  }
  return null;
}

export function percent(doneSec: number, totalSec: number): number {
  if (!(totalSec > 0)) return 0;
  return Math.max(0, Math.min(100, Math.floor((doneSec / totalSec) * 100)));
}
