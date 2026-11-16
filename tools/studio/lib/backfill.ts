// Backfill: add lower qualities to videos that are already on the site.
// Looks at the originals Studio kept in done/, finds each one on the site by its title, makes the
// lower copies from the original and attaches them. Videos that already have lower copies are skipped.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { ApiError, AuthError, RestartUploadError, withRetry, uploadFile, type RetryNotice, type SiteVideo } from "./api";
import { SpeedMeter, formatBytes, uploadLine } from "./chunks";
import { FfmpegError, FileError, ToolMissingError, explainFfmpegFailure, probe } from "./ffmpeg";
import { baseName, cleanTitle, computeScale, isVideoFile, parseSidecar, planRenditions, shortSide } from "./media";
import { makeRendition, type Ctx } from "./pipeline";
import { ui } from "./ui";

function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}

/** "clip (2).mp4" was renamed by Studio to avoid a clash; the title is still "clip". */
const withoutCopySuffix = (name: string) => name.replace(/ \(\d+\)(\.[^.]+)$/, "$1");

async function titleFor(file: string): Promise<string> {
  const side = path.join(path.dirname(file), `${baseName(path.basename(file))}.json`);
  try {
    const { sidecar } = parseSidecar(await readFile(side, "utf8"));
    if (sidecar.title) return sidecar.title;
  } catch {
    /* no sidecar */
  }
  return cleanTitle(withoutCopySuffix(path.basename(file)));
}

export type BackfillResult = { added: number; skipped: number; failed: number };

export async function backfill(ctx: Ctx, opts: { planOnly: boolean }): Promise<BackfillResult> {
  const { config, dirs } = ctx;
  const client = ctx.client!;
  const result: BackfillResult = { added: 0, skipped: 0, failed: 0 };

  const names = (await readdir(dirs.done).catch(() => [] as string[])).filter(isVideoFile).sort();
  if (names.length === 0) {
    ui.info(`There are no videos in ${dirs.done}. Backfill uses the original files Studio kept there.`);
    return result;
  }
  ui.info(`Checking ${names.length} original video${names.length === 1 ? "" : "s"} in ${dirs.done}`);
  if (opts.planOnly) ui.info("Plan only: nothing will be converted or uploaded.");

  const onRetry: RetryNotice = ({ attempt, waitMs, reason }) =>
    ui.warn(`Connection problem (${reason}). Trying again in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1} of 5)...`);

  for (const name of names) {
    const file = path.join(dirs.done, name);
    ui.info("");
    ui.info(`▶ ${name}`);
    const workDir = path.join(dirs.work, `backfill-${createHash("sha256").update(name).digest("hex").slice(0, 10)}`);
    try {
      const title = await titleFor(file);
      const matches = await withRetry(() => client.findVideos(title), onRetry);
      if (matches.length === 0) {
        ui.step(`Skipped: no video titled "${title}" is on the site. (If you renamed it there, put a ${baseName(name)}.json next to the file with {"title": "its exact title"}.)`);
        result.skipped++;
        continue;
      }

      const info = await probe(config.ffprobePath, file);
      // The site's copy was made from this original, so it has the size Studio would give it today.
      const main = computeScale(info.width, info.height, config.maxHeight);
      const near = matches.filter((m) => Math.abs(m.durationSec - info.durationSec) <= 3);
      let video: SiteVideo | undefined;
      if (near.length === 1) video = near[0];
      else if (matches.length === 1 && near.length === 0) {
        ui.step(`Skipped: the video titled "${title}" on the site is ${matches[0].durationSec}s long, but this file is ${Math.round(info.durationSec)}s, so it is probably a different video.`);
        result.skipped++;
        continue;
      } else {
        ui.step(`Skipped: more than one video on the site is titled "${title}", so Studio cannot tell which one this is.`);
        result.skipped++;
        continue;
      }
      if (video.type !== "LONG") {
        ui.step("Skipped: shorts have no quality menu.");
        result.skipped++;
        continue;
      }
      if (video.renditionCount > 0) {
        ui.step("Skipped: it already has lower qualities.");
        result.skipped++;
        continue;
      }
      const targets = planRenditions(main.width, main.height, config.qualities);
      if (targets.length === 0) {
        ui.step(`Skipped: it is only ${shortSide(main.width, main.height)}p, so there is nothing lower to offer.`);
        result.skipped++;
        continue;
      }
      ui.step(`Found "${video.title}" on the site. Will add: ${targets.map((t) => `${t}p`).join(", ")}`);
      if (opts.planOnly) continue;

      await rm(workDir, { recursive: true, force: true });
      await mkdir(workDir, { recursive: true });

      const made: { height: number; file: string; size: number; sha256: string; uploadId?: string }[] = [];
      for (const target of targets) {
        const out = path.join(workDir, `video-${target}p.mp4`);
        const r = await makeRendition(config, { input: file, output: out, width: info.width, height: info.height, target, durationSec: info.durationSec });
        if (r.size <= 0 || r.size > ctx.maxVideoBytes) throw new FileError(`The ${target}p copy came out ${formatBytes(r.size)}, which the site cannot take.`, "Lower STUDIO_CRF is not needed; try fewer qualities in STUDIO_QUALITIES.");
        made.push({ height: target, file: out, size: r.size, sha256: await hashFile(out) });
      }

      const total = made.reduce((n, m) => n + m.size, 0);
      const sent = new Map<number, number>();
      const meter = new SpeedMeter();
      for (const m of made) {
        for (let restart = 0; ; restart++) {
          try {
            m.uploadId = await uploadFile(
              client,
              { kind: "rendition", path: m.file, filename: path.basename(m.file), size: m.size, sha256: m.sha256 },
              {
                onProgress: (received) => {
                  sent.set(m.height, received);
                  const bytes = [...sent.values()].reduce((a, b) => a + b, 0);
                  meter.add(Date.now(), bytes);
                  ui.progress("Uploading", total ? Math.floor((bytes / total) * 100) : 100, uploadLine(bytes, total, meter.bytesPerSec(), meter.etaSec(total - bytes)));
                },
                onUploadId: () => {},
                onRetry,
              },
            );
            break;
          } catch (e) {
            if (e instanceof RestartUploadError && restart < 1) {
              ui.warn(`Have to send the ${m.height}p copy again (${e.message}).`);
              continue;
            }
            throw e;
          }
        }
      }
      ui.progressDone();

      await withRetry(
        () => client.attachRenditions(video.id, { heightPx: shortSide(main.width, main.height), renditions: made.map((m) => ({ height: m.height, uploadId: m.uploadId! })) }),
        onRetry,
      );
      ui.ok(`"${video.title}" now has ${targets.map((t) => `${t}p`).join(", ")} in its quality menu.`);
      result.added++;
    } catch (err) {
      ui.progressDone();
      if (err instanceof AuthError || err instanceof ToolMissingError) throw err;
      result.failed++;
      if (err instanceof FfmpegError) {
        const x = explainFfmpegFailure(err.stderr);
        ui.error(`Could not convert "${name}": ${x.message}`);
      } else if (err instanceof FileError) ui.error(`"${name}": ${err.message}`);
      else if (err instanceof ApiError) ui.error(`The site refused "${name}": ${err.message} (HTTP ${err.status} ${err.code})`);
      else ui.error(`"${name}" stopped: ${(err as Error)?.message ?? err}`);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
  return result;
}
