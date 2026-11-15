// Thin wrappers around the system ffmpeg/ffprobe. Arguments are always arrays (no shell).
import { spawn, type ChildProcess } from "node:child_process";
import { parseProgressLine, probeArgs } from "./ffargs";
import { parseProbe, type MediaInfo } from "./media";

export class ToolMissingError extends Error {
  constructor(public tool: string) {
    super(`${tool} was not found`);
  }
}

export class FfmpegError extends Error {
  constructor(
    message: string,
    public stderr: string,
  ) {
    super(message);
  }
}

/** The file itself is the problem (not a video, damaged ...). It goes to failed/. */
export class FileError extends Error {
  constructor(
    message: string,
    public hint: string,
  ) {
    super(message);
  }
}

let current: ChildProcess | null = null;

/** Stop the running ffmpeg, if any (used on Ctrl+C). */
export function killCurrent() {
  try {
    current?.kill();
  } catch {
    /* already gone */
  }
}

export function run(bin: string, args: string[], onLine?: (line: string) => void): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(bin, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      reject(e);
      return;
    }
    current = child;
    let stdout = "";
    let stderr = "";
    let pending = "";
    child.stdout!.setEncoding("utf8").on("data", (d: string) => {
      if (!onLine) {
        stdout += d;
        return;
      }
      pending += d;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const l of lines) onLine(l);
    });
    child.stderr!.setEncoding("utf8").on("data", (d: string) => {
      stderr = (stderr + d).slice(-8000);
    });
    child.on("error", (e: NodeJS.ErrnoException) => {
      if (current === child) current = null;
      reject(e.code === "ENOENT" ? new ToolMissingError(bin) : e);
    });
    child.on("close", (code, signal) => {
      if (current === child) current = null;
      if (code === 0) resolve({ stdout, stderr });
      else reject(new FfmpegError(`${bin} stopped with ${signal ? `signal ${signal}` : `exit code ${code}`}`, stderr.trim()));
    });
  });
}

/** Run ffmpeg and report encoded seconds as it goes (needs `-progress pipe:1` in args). */
export function runWithProgress(bin: string, args: string[], onSeconds: (sec: number) => void) {
  return run(bin, args, (line) => {
    const p = parseProgressLine(line);
    if (typeof p === "number") onSeconds(p);
  });
}

export async function toolVersion(bin: string): Promise<string> {
  const { stdout } = await run(bin, ["-version"]);
  return /version\s+(\S+)/.exec(stdout)?.[1] ?? "unknown";
}

export async function probe(ffprobe: string, file: string): Promise<MediaInfo> {
  let stdout: string;
  try {
    ({ stdout } = await run(ffprobe, probeArgs(file)));
  } catch (e) {
    if (e instanceof FfmpegError)
      throw new FileError(
        "This file could not be read as a video.",
        "It may be damaged, still incomplete, or not really a video. Try playing it on this PC; if it plays, export it again as MP4 and drop the new file into the incoming folder.",
      );
    throw e;
  }
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  const r = parseProbe(json);
  if (!r.ok) throw new FileError(r.reason, "Only real video files can be processed. Check the file plays on this PC, then try again.");
  return r.info;
}

/** Turn ffmpeg's stderr into advice a non-expert can act on. */
export function explainFfmpegFailure(stderr: string): { message: string; hint: string } {
  const s = stderr.toLowerCase();
  if (s.includes("no space left"))
    return { message: "The disk ran out of space while processing.", hint: "Free up some disk space, then move the video back into the incoming folder." };
  if (s.includes("moov atom not found"))
    return { message: "The video file is incomplete (its index is missing).", hint: "The recording or copy was probably cut off. Copy the file again from the camera/phone and retry." };
  if (s.includes("invalid data found") || s.includes("error while decoding") || s.includes("corrupt"))
    return { message: "The video file looks damaged.", hint: "Try playing it on this PC. If it plays, re-export it as MP4 from your editor and drop the new file into the incoming folder." };
  if (s.includes("permission denied"))
    return { message: "Windows would not let Studio read or write a file.", hint: "Close any program that has the video open (player, editor), then move it back into the incoming folder." };
  return { message: "ffmpeg could not process this video.", hint: "Try re-exporting the video as MP4 (H.264) from your editor, then drop the new file into the incoming folder." };
}
