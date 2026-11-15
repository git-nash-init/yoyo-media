// studio/state.json: remembers finished encodes and upload ids so an interrupted
// run resumes without re-encoding or re-sending bytes the site already has.
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UploadKind } from "./api";
import type { VideoType } from "./media";

export type OutputFile = {
  kind: UploadKind;
  /** File name inside the entry's work folder. */
  file: string;
  size: number;
  sha256: string;
  uploadId?: string;
};

export type Entry = {
  source: string;
  workDir: string;
  durationSec: number;
  width: number;
  height: number;
  autoType: VideoType;
  mode: "remux" | "transcode";
  outputs: OutputFile[];
  processedAt: string;
  videoId?: string;
  adminUrl?: string;
};

type StateFile = { version: 1; files: Record<string, Entry> };

/** Identity of a source file: same name, size and modified time means same content. */
export function fileKey(name: string, size: number, mtimeMs: number): string {
  return `${name}|${size}|${Math.round(mtimeMs)}`;
}

/** Short, filesystem-safe folder name for a source file's outputs. */
export function workDirName(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

export class StateStore {
  private data: StateFile = { version: 1, files: {} };
  constructor(private file: string) {}

  async load() {
    try {
      const raw = JSON.parse(await readFile(this.file, "utf8")) as StateFile;
      if (raw && raw.version === 1 && raw.files && typeof raw.files === "object") this.data = raw;
    } catch {
      /* first run or unreadable state: start fresh (worst case we re-encode) */
    }
  }

  get(key: string): Entry | undefined {
    return this.data.files[key];
  }
  entries(): [string, Entry][] {
    return Object.entries(this.data.files);
  }
  async set(key: string, entry: Entry) {
    this.data.files[key] = entry;
    await this.save();
  }
  async delete(key: string) {
    if (key in this.data.files) {
      delete this.data.files[key];
      await this.save();
    }
  }
  /** Write to a temp file then rename, so a crash never leaves half a state file. */
  async save() {
    const tmp = path.join(path.dirname(this.file), `.state-${process.pid}.tmp`);
    await writeFile(tmp, JSON.stringify(this.data, null, 2), "utf8");
    await rename(tmp, this.file);
  }
}
