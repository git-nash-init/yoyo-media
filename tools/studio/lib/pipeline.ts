// The per-file pipeline: probe -> encode -> thumbnails -> preview -> hash -> upload -> create draft.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError, AuthError, GaveUpError, RestartUploadError, StudioClient, uploadFile, withRetry, type RetryNotice } from "./api";
import { SpeedMeter, formatBytes, formatDuration, uploadLine } from "./chunks";
import type { StudioConfig } from "./config";
import { percent, previewArgs, remuxArgs, thumbArgs, transcodeArgs } from "./ffargs";
import { FfmpegError, FileError, ToolMissingError, explainFfmpegFailure, probe, run, runWithProgress } from "./ffmpeg";
import { baseName, canRemux, cleanTitle, computeScale, decideType, parseSidecar, previewWindow, thumbTimes, type Sidecar } from "./media";
import { StateStore, fileKey, workDirName, type Entry, type OutputFile } from "./state";
import { ui } from "./ui";

export type Dirs = { root: string; incoming: string; work: string; done: string; failed: string };

export type Ctx = {
  config: StudioConfig;
  dirs: Dirs;
  state: StateStore;
  client: StudioClient | null;
  dryRun: boolean;
  maxVideoBytes: number;
};

/** done = uploaded; dry = processed only; failed = moved to failed/; later = network trouble, work kept. */
export type Outcome = "done" | "dry" | "failed" | "later";

export function dirsFor(root: string): Dirs {
  return {
    root,
    incoming: path.join(root, "incoming"),
    work: path.join(root, "work"),
    done: path.join(root, "done"),
    failed: path.join(root, "failed"),
  };
}

function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false,
  );
}

/** Move a file, never overwriting: "clip.mp4" becomes "clip (2).mp4" if the name is taken. */
async function moveInto(file: string, destDir: string): Promise<string> {
  const name = path.basename(file);
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let dest = path.join(destDir, name);
  for (let i = 2; await exists(dest); i++) dest = path.join(destDir, `${stem} (${i})${ext}`);
  try {
    await rename(file, dest);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    await copyFile(file, dest); // different drive: copy then delete
    await unlink(file);
  }
  return dest;
}

async function readSidecar(sourcePath: string): Promise<{ sidecar: Sidecar; file: string | null }> {
  const file = path.join(path.dirname(sourcePath), `${baseName(path.basename(sourcePath))}.json`);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return { sidecar: {}, file: null };
  }
  const { sidecar, warnings } = parseSidecar(text);
  for (const w of warnings) ui.warn(`${path.basename(file)}: ${w}.`);
  return { sidecar, file };
}

async function entryIsUsable(ctx: Ctx, entry: Entry | undefined): Promise<boolean> {
  if (!entry || !entry.outputs?.length) return false;
  for (const o of entry.outputs) {
    const s = await stat(path.join(ctx.dirs.work, entry.workDir, o.file)).catch(() => null);
    if (!s || s.size !== o.size) return false;
  }
  return true;
}

/** Steps 1-6: produce the web-ready video, thumbnails and preview in work/<id>/. */
async function encode(ctx: Ctx, sourcePath: string, key: string): Promise<Entry> {
  const { config } = ctx;
  const name = path.basename(sourcePath);
  const info = await probe(config.ffprobePath, sourcePath);
  const autoType = decideType(info.width, info.height, info.durationSec);
  ui.step(`${info.width}x${info.height}, ${formatDuration(info.durationSec)}, ${info.videoCodec || "unknown codec"}`);

  const workDir = workDirName(key);
  const dir = path.join(ctx.dirs.work, workDir);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const videoOut = path.join(dir, "video.mp4");
  const scale = computeScale(info.width, info.height, config.maxHeight);
  let mode: Entry["mode"] = "transcode";
  const showProgress = (label: string) => (sec: number) => ui.progress(label, percent(sec, info.durationSec));

  if (canRemux(info, name, config.maxHeight)) {
    try {
      await runWithProgress(config.ffmpegPath, remuxArgs({ input: sourcePath, output: videoOut }), showProgress("Optimising for streaming (no re-encode)"));
      mode = "remux";
      ui.progressDone();
      ui.step("Already web-ready: kept the original quality, only optimised it for streaming");
    } catch (e) {
      ui.progressDone();
      if (!(e instanceof FfmpegError)) throw e;
      ui.step("Quick optimise did not work for this file, converting it fully instead");
    }
  }
  if (mode === "transcode") {
    const label = `Converting to ${scale.width}x${scale.height} MP4`;
    await runWithProgress(
      config.ffmpegPath,
      transcodeArgs({ input: sourcePath, output: videoOut, width: scale.width, height: scale.height, crf: config.crf }),
      showProgress(label),
    );
    ui.progress(label, 100);
    ui.progressDone();
  }

  // Measure the finished file: thumbnails and preview are cut from it (already rotated and scaled).
  const out = await probe(config.ffprobePath, videoOut);
  const videoSize = (await stat(videoOut)).size;
  if (videoSize > ctx.maxVideoBytes)
    throw new FileError(
      `The converted video is ${formatBytes(videoSize)}, larger than the site's limit of ${formatBytes(ctx.maxVideoBytes)}.`,
      "Open tools/studio/.env and lower STUDIO_MAX_HEIGHT (for example 480) or raise STUDIO_CRF (for example 26), or split the video into parts. Then move it back into the incoming folder.",
    );

  const portrait = out.height > out.width;
  const outputs: OutputFile[] = [{ kind: "video", file: "video.mp4", size: videoSize, sha256: "" }];

  let n = 0;
  for (const at of thumbTimes(out.durationSec)) {
    const file = `thumb-${++n}.jpg`;
    try {
      await run(config.ffmpegPath, thumbArgs({ input: videoOut, output: path.join(dir, file), atSec: at, maxWidth: portrait ? 720 : 1280 }));
      const s = await stat(path.join(dir, file));
      if (s.size > 0) outputs.push({ kind: "thumb", file, size: s.size, sha256: "" });
    } catch (e) {
      if (!(e instanceof FfmpegError)) throw e; // a missing thumbnail is not fatal; the admin can upload one
    }
  }
  const thumbCount = outputs.length - 1;
  ui.step(thumbCount ? `Made ${thumbCount} thumbnail${thumbCount === 1 ? "" : "s"} to choose from` : "Could not make thumbnails (you can upload one on the site)");

  const win = previewWindow(out.durationSec);
  try {
    await run(config.ffmpegPath, previewArgs({ input: videoOut, output: path.join(dir, "preview.mp4"), startSec: win.start, lengthSec: win.length }));
    const s = await stat(path.join(dir, "preview.mp4"));
    if (s.size > 0) outputs.push({ kind: "preview", file: "preview.mp4", size: s.size, sha256: "" });
    ui.step(`Made a ${Math.round(win.length)}-second silent preview clip`);
  } catch (e) {
    if (!(e instanceof FfmpegError)) throw e;
    ui.step("Could not make a preview clip (the video will still work)");
  }

  for (const o of outputs) o.sha256 = await hashFile(path.join(dir, o.file));

  const entry: Entry = {
    source: name,
    workDir,
    durationSec: Math.max(1, Math.round(out.durationSec)),
    width: out.width,
    height: out.height,
    autoType,
    mode,
    outputs,
    processedAt: new Date().toISOString(),
  };
  await ctx.state.set(key, entry);
  return entry;
}

/** Step 8: push every output, then create the draft video. */
async function upload(ctx: Ctx, key: string, entry: Entry, meta: { title: string; description?: string; type: "LONG" | "SHORT" }) {
  const client = ctx.client!;
  const dir = path.join(ctx.dirs.work, entry.workDir);
  const total = entry.outputs.reduce((n, o) => n + o.size, 0);
  const sent = new Map<OutputFile, number>();
  const meter = new SpeedMeter();
  const draw = () => {
    const bytes = [...sent.values()].reduce((a, b) => a + b, 0);
    meter.add(Date.now(), bytes);
    ui.progress("Uploading", total ? Math.floor((bytes / total) * 100) : 100, uploadLine(bytes, total, meter.bytesPerSec(), meter.etaSec(total - bytes)));
  };
  const onRetry: RetryNotice = ({ attempt, waitMs, reason }) =>
    ui.warn(`Connection problem (${reason}). Trying again in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1} of 5)...`);

  for (const o of entry.outputs) {
    for (let restart = 0; ; restart++) {
      try {
        o.uploadId = await uploadFile(
          client,
          { kind: o.kind, path: path.join(dir, o.file), filename: o.file, size: o.size, sha256: o.sha256, uploadId: o.uploadId },
          {
            onProgress: (received) => {
              sent.set(o, received);
              draw();
            },
            onUploadId: async (id) => {
              o.uploadId = id;
              await ctx.state.save(); // remember it immediately so a crash can resume
            },
            onRetry,
          },
        );
        break;
      } catch (e) {
        if (e instanceof RestartUploadError && restart < 1) {
          ui.warn(`Have to send ${o.file} again (${e.message}).`);
          o.uploadId = undefined;
          sent.set(o, 0);
          await ctx.state.save();
          continue;
        }
        throw e instanceof RestartUploadError ? new GaveUpError(e.message) : e;
      }
    }
  }
  await ctx.state.save();
  ui.progressDone();

  const videoId = entry.outputs.find((o) => o.kind === "video")!.uploadId!;
  try {
    const created = await withRetry(
      () =>
        client.createVideo({
          title: meta.title,
          type: meta.type,
          durationSec: entry.durationSec,
          ...(meta.description ? { description: meta.description } : {}),
          videoUploadId: videoId,
          previewUploadId: entry.outputs.find((o) => o.kind === "preview")?.uploadId,
          thumbUploadIds: entry.outputs.filter((o) => o.kind === "thumb").map((o) => o.uploadId!),
        }),
      onRetry,
    );
    entry.videoId = created.videoId;
    entry.adminUrl = created.adminUrl;
  } catch (e) {
    // The draft was created on an earlier try but the answer never reached us.
    if (e instanceof ApiError && e.code === "UPLOAD_CONSUMED") entry.videoId = "unknown";
    else throw e;
  }
  await ctx.state.set(key, entry);
}

async function finishOriginal(ctx: Ctx, sourcePath: string, sidecarFile: string | null) {
  if (ctx.config.keepOriginals) {
    await moveInto(sourcePath, ctx.dirs.done);
    if (sidecarFile) await moveInto(sidecarFile, ctx.dirs.done).catch(() => {});
  } else {
    await unlink(sourcePath);
    if (sidecarFile) await unlink(sidecarFile).catch(() => {});
  }
}

async function moveToFailed(ctx: Ctx, sourcePath: string, sidecarFile: string | null, message: string, hint: string, detail?: string) {
  const name = path.basename(sourcePath);
  ui.error(`"${name}" could not be processed: ${message}`);
  ui.info(`  How to fix: ${hint}`);
  let dest = sourcePath;
  try {
    dest = await moveInto(sourcePath, ctx.dirs.failed);
    if (sidecarFile) await moveInto(sidecarFile, ctx.dirs.failed).catch(() => {});
    ui.info(`  The file was moved to ${dest}`);
  } catch {
    ui.warn(`Could not move "${name}" to the failed folder (is it open in another program?). It will be skipped until Studio restarts.`);
  }
  const note = [
    `YoYo Studio could not process "${name}"`,
    `When: ${new Date().toLocaleString()}`,
    "",
    `What went wrong: ${message}`,
    "",
    `How to fix: ${hint}`,
    "",
    "After fixing it, move the video back into the incoming folder to try again.",
    ...(detail ? ["", "Technical details (for whoever helps you):", detail] : []),
    "",
  ].join("\r\n");
  await writeFile(path.join(ctx.dirs.failed, `${path.basename(dest)}.error.txt`), note, "utf8").catch(() => {});
}

/**
 * Process one file from incoming/. Throws only AuthError and ToolMissingError (the
 * caller must stop); every other problem is turned into an Outcome.
 */
export async function processFile(ctx: Ctx, sourcePath: string): Promise<Outcome> {
  const name = path.basename(sourcePath);
  const st = await stat(sourcePath);
  const key = fileKey(name, st.size, st.mtimeMs);
  const { sidecar, file: sidecarFile } = await readSidecar(sourcePath);
  const cleanWork = async (entry?: Entry) => {
    await rm(path.join(ctx.dirs.work, entry?.workDir ?? workDirName(key)), { recursive: true, force: true }).catch(() => {});
    await ctx.state.delete(key).catch(() => {});
  };

  ui.info("");
  ui.info(`▶ ${name}  (${formatBytes(st.size)})`);

  let entry = ctx.state.get(key);
  try {
    if (await entryIsUsable(ctx, entry)) {
      ui.step("Already processed earlier, picking up where it stopped");
    } else {
      entry = await encode(ctx, sourcePath, key);
    }
    const e = entry!;
    const meta = {
      title: sidecar.title ?? cleanTitle(name),
      description: sidecar.description,
      type: sidecar.type ?? e.autoType,
    };
    ui.step(`Title: "${meta.title}"  -  Type: ${meta.type === "SHORT" ? "Short (vertical)" : "Long video"}`);

    if (ctx.dryRun) {
      const dir = path.join(ctx.dirs.work, e.workDir);
      ui.ok(`Dry run: "${meta.title}" is processed but was NOT uploaded. Outputs are in ${dir}`);
      for (const o of e.outputs) ui.info(`    ${o.file.padEnd(12)} ${formatBytes(o.size).padStart(9)}  sha256 ${o.sha256.slice(0, 16)}...`);
      return "dry";
    }

    if (!e.videoId) await upload(ctx, key, e, meta);
    await finishOriginal(ctx, sourcePath, sidecarFile);
    await cleanWork(e);
    if (e.adminUrl)
      ui.ok(`"${meta.title}" uploaded as a draft → ${ctx.config.siteUrl}${e.adminUrl} (open it to add details, pick a thumbnail and publish)`);
    else ui.ok(`"${meta.title}" was already uploaded as a draft → find it under ${ctx.config.siteUrl}/admin/videos (add details, pick a thumbnail and publish)`);
    return "done";
  } catch (err) {
    ui.progressDone();
    if (err instanceof AuthError || err instanceof ToolMissingError) throw err;
    if (err instanceof GaveUpError) {
      ui.error(`Upload of "${name}" stopped: the internet connection is too slow or keeps dropping (${err.message}).`);
      ui.info("  Nothing is lost: the processed video is saved and the upload will continue from where it stopped.");
      return "later";
    }
    if (err instanceof FileError) {
      await cleanWork(entry);
      await moveToFailed(ctx, sourcePath, sidecarFile, err.message, err.hint);
      return "failed";
    }
    if (err instanceof FfmpegError) {
      const x = explainFfmpegFailure(err.stderr);
      await cleanWork(entry);
      await moveToFailed(ctx, sourcePath, sidecarFile, x.message, x.hint, err.stderr.slice(-2000));
      return "failed";
    }
    if (err instanceof ApiError) {
      const tooBig = err.code === "TOO_LARGE";
      await cleanWork(entry);
      await moveToFailed(
        ctx,
        sourcePath,
        sidecarFile,
        `The site refused the upload: ${err.message}`,
        tooBig
          ? "Lower STUDIO_MAX_HEIGHT or raise STUDIO_CRF in tools/studio/.env to make the file smaller, then move the video back into the incoming folder."
          : "Make sure the site and YoYo Studio are both up to date, then move the video back into the incoming folder. If it keeps happening, show this note to your developer.",
        `HTTP ${err.status} ${err.code}`,
      );
      return "failed";
    }
    const e2 = err as NodeJS.ErrnoException;
    if (e2?.code === "ENOSPC") {
      ui.error("This PC's disk is full. Free up some space; Studio will try this video again.");
      return "later";
    }
    await cleanWork(entry);
    await moveToFailed(
      ctx,
      sourcePath,
      sidecarFile,
      "An unexpected problem stopped the processing.",
      "Move the video back into the incoming folder to try again. If it keeps happening, show this note to your developer.",
      String(e2?.stack ?? e2),
    );
    return "failed";
  }
}
