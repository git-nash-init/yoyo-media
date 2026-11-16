// YoYo Studio: turns videos dropped into studio/incoming into web-ready files on this PC
// and pushes them to the site as drafts. Run with `npm run studio`.
// Standalone program: Node built-ins + system ffmpeg only, no imports from the Next app.
import { watch, type FSWatcher } from "node:fs";
import { mkdir, open, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { ApiError, AuthError, NetworkError, StudioClient } from "./lib/api";
import { formatBytes } from "./lib/chunks";
import { buildConfig, isInsecureRemote, parseDotEnv, parseFlags, type StudioConfig } from "./lib/config";
import { ToolMissingError, killCurrent, toolVersion } from "./lib/ffmpeg";
import { fileExt, isVideoFile } from "./lib/media";
import { backfill } from "./lib/backfill";
import { dirsFor, processFile, type Ctx, type Dirs } from "./lib/pipeline";
import { StateStore } from "./lib/state";
import { ui } from "./lib/ui";

const STUDIO_DIR = typeof __dirname === "string" ? __dirname : path.join(process.cwd(), "tools", "studio");
const REPO_ROOT = path.resolve(STUDIO_DIR, "..", "..");
const ENV_FILE = path.join(STUDIO_DIR, ".env");

const STABLE_MS = 3000; // a file must stop changing for this long before we touch it
const POLL_MS = 3000;
const RETRY_LATER_MS = 60_000;
const DEFAULT_MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
const TEMP_EXTENSIONS = ["part", "tmp", "crdownload", "download", "partial"];

const HELP = `
YoYo Studio - prepares your videos on this PC and uploads them to the site as drafts.

Usage:  npm run studio            process everything in the incoming folder, then keep watching
        npm run studio -- --once     process what is there now, then exit
        npm run studio -- --dry-run  process but do not upload (outputs stay in studio/work)
        npm run studio -- --backfill add lower qualities to videos already on the site (uses studio/done)
        npm run studio -- --backfill --dry-run   show what backfill would do, without converting or uploading
        npm run studio -- --help     show this help

Setup:  1. On the site open Admin -> Ingest tokens and create a token.
        2. Copy tools/studio/.env.example to tools/studio/.env and paste the token.
        3. Run "npm run studio" and drop video files into studio/incoming.
`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loadConfig(): Promise<StudioConfig> {
  let fileEnv: Record<string, string> = {};
  try {
    fileEnv = parseDotEnv(await readFile(ENV_FILE, "utf8"));
  } catch {
    /* no .env yet: defaults apply, and the token check below explains what to do */
  }
  const { config, problems } = buildConfig(fileEnv, process.env, REPO_ROOT);
  if (problems.length) {
    for (const p of problems) ui.error(p);
    ui.info(`Fix it in ${ENV_FILE} and start again.`);
    process.exit(1);
  }
  return config;
}

async function checkTools(config: StudioConfig) {
  for (const [label, bin, envName] of [
    ["ffmpeg", config.ffmpegPath, "FFMPEG_PATH"],
    ["ffprobe", config.ffprobePath, "FFPROBE_PATH"],
  ] as const) {
    try {
      const v = await toolVersion(bin);
      if (label === "ffmpeg") ui.info(`ffmpeg ${v} found`);
    } catch {
      ui.error(`${label} is not installed (or not on the PATH), and Studio cannot work without it.`);
      ui.info("  Install it on Windows by running this in a terminal:   winget install Gyan.FFmpeg");
      ui.info("  (Mac: brew install ffmpeg   Linux: sudo apt install ffmpeg   or see https://ffmpeg.org/download.html)");
      ui.info(`  Then close and reopen the terminal. If it is installed somewhere unusual, set ${envName} in ${ENV_FILE}.`);
      process.exit(1);
    }
  }
}

/** Give open sockets a moment to close before exiting; calling process.exit() mid-close aborts with a libuv assertion on Windows. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 150));

function tokenHelp() {
  ui.info("  1. Open the site, go to Admin -> Ingest tokens and create a new token.");
  ui.info(`  2. Paste it after STUDIO_TOKEN= in ${ENV_FILE}`);
  ui.info("  3. Start Studio again.");
}

/** Validate site URL + token before any work is done. Exits with a clear message on failure. */
async function connect(config: StudioConfig): Promise<{ client: StudioClient; maxVideoBytes: number }> {
  if (!config.token) {
    ui.error("No upload token is set yet (STUDIO_TOKEN is empty).");
    tokenHelp();
    ui.info("  (To try Studio without uploading, run:  npm run studio -- --dry-run)");
    process.exit(1);
  }
  if (isInsecureRemote(config.siteUrl))
    ui.warn(`${config.siteUrl} is not https, so the token travels unprotected. Use the https:// address of the site.`);

  const client = new StudioClient(config.siteUrl, config.token);
  try {
    const ping = await client.ping();
    if (ping.ok !== true || typeof ping.maxVideoBytes !== "number") throw new ApiError(404, "NOT_YOYO", "unexpected answer", {});
    ui.info(`Connected to ${config.siteUrl} with token "${ping.tokenName}" (videos up to ${formatBytes(ping.maxVideoBytes)})`);
    return { client, maxVideoBytes: ping.maxVideoBytes };
  } catch (e) {
    if (e instanceof AuthError) {
      ui.error("The site did not accept the token: it is mistyped, or it was revoked.");
      tokenHelp();
    } else if (e instanceof NetworkError) {
      ui.error(`Cannot reach the site at ${config.siteUrl} (${e.message}).`);
      ui.info("  - Is this PC connected to the internet?");
      ui.info(`  - Is STUDIO_SITE_URL in ${ENV_FILE} the right address (starting with https://)?`);
      ui.info("  - If the site runs on this PC, start it first (npm run dev).");
    } else if (e instanceof ApiError && e.status === 429) {
      ui.error("The site is refusing connections from this PC for a few minutes after too many wrong-token attempts.");
      ui.info(`  Check STUDIO_TOKEN in ${ENV_FILE}, wait about 10 minutes, then start Studio again.`);
    } else if (e instanceof ApiError && e.status === 404) {
      ui.error(`${config.siteUrl} answered, but it does not look like the YoYo Videos site.`);
      ui.info(`  Check STUDIO_SITE_URL in ${ENV_FILE} (just the site address, for example https://example.com).`);
    } else {
      ui.error(`The site answered with an error${e instanceof ApiError ? ` (HTTP ${e.status})` : ""}. Try again in a few minutes.`);
    }
    await settle(); // let the HTTP client close its sockets first (avoids a libuv assertion on Windows)
    process.exit(1);
  }
}

/** Is the file finished copying? Size must be stable and nobody may hold it open for writing. */
class StabilityTracker {
  private seen = new Map<string, { size: number; mtimeMs: number; since: number }>();

  async isReady(file: string): Promise<boolean> {
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) {
      this.seen.delete(file);
      return false;
    }
    const now = Date.now();
    const prev = this.seen.get(file);
    if (!prev || prev.size !== s.size || prev.mtimeMs !== s.mtimeMs) {
      this.seen.set(file, { size: s.size, mtimeMs: s.mtimeMs, since: now });
      return false;
    }
    if (s.size === 0 || now - prev.since < STABLE_MS) return false;
    // Windows Explorer reserves the full size up front; while it copies, opening for write fails.
    try {
      const fh = await open(file, "r+");
      await fh.close();
      return true;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EBUSY") return false;
      // Read-only files can never be opened for writing: accept them after a longer quiet period.
      return (code === "EPERM" || code === "EACCES") && now - prev.since > 30_000;
    }
  }
  forget(file: string) {
    this.seen.delete(file);
  }
}

/** Remove leftovers in work/ and state.json that belong to files no longer in incoming/. */
async function tidy(dirs: Dirs, state: StateStore) {
  const present = new Set(await readdir(dirs.incoming).catch(() => [] as string[]));
  const keep = new Set<string>();
  for (const [key, entry] of state.entries()) {
    if (present.has(entry.source)) keep.add(entry.workDir);
    else await state.delete(key);
  }
  for (const d of await readdir(dirs.work).catch(() => [] as string[]))
    if (!keep.has(d)) await rm(path.join(dirs.work, d), { recursive: true, force: true }).catch(() => {});
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    console.log(HELP);
    return;
  }
  if (flags.unknown.length) {
    ui.error(`Unknown option: ${flags.unknown.join(" ")}`);
    console.log(HELP);
    process.exit(1);
  }

  ui.info("");
  ui.info("  YoYo Studio  -  drop videos in, get drafts on the site");
  ui.info("  ------------------------------------------------------");

  const config = await loadConfig();
  const dirs = dirsFor(config.dir);
  for (const d of [dirs.root, dirs.incoming, dirs.work, dirs.done, dirs.failed]) await mkdir(d, { recursive: true });

  await checkTools(config);

  if (flags.backfill) {
    // Backfill always talks to the site (it has to look the videos up); --dry-run only skips the converting and uploading.
    const { client, maxVideoBytes } = await connect(config);
    const state = new StateStore(path.join(dirs.root, "state.json"));
    const ctx: Ctx = { config, dirs, state, client, dryRun: flags.dryRun, maxVideoBytes };
    let result;
    try {
      result = await backfill(ctx, { planOnly: flags.dryRun });
    } catch (e) {
      if (e instanceof AuthError) {
        ui.error("The site stopped accepting the token (it was probably revoked).");
        tokenHelp();
      } else if (e instanceof ToolMissingError) ui.error(`${e.tool} could not be started. Reinstall ffmpeg (winget install Gyan.FFmpeg) and try again.`);
      else ui.error(`Backfill stopped: ${(e as Error)?.message ?? e}`);
      await settle();
      process.exit(1);
    }
    ui.info("");
    ui.info(`Backfill finished: ${result.added} updated, ${result.skipped} skipped, ${result.failed} failed.`);
    await settle();
    process.exit(result.failed ? 1 : 0);
  }

  let client: StudioClient | null = null;
  let maxVideoBytes = DEFAULT_MAX_VIDEO_BYTES;
  if (flags.dryRun) ui.info("Dry run: videos will be processed but nothing will be uploaded.");
  else ({ client, maxVideoBytes } = await connect(config));

  const state = new StateStore(path.join(dirs.root, "state.json"));
  await state.load();
  await tidy(dirs, state);

  const ctx: Ctx = { config, dirs, state, client, dryRun: flags.dryRun, maxVideoBytes };
  const tracker = new StabilityTracker();
  const finished = new Set<string>(); // dry-run results and files we could not move away
  const retryAt = new Map<string, number>(); // network trouble: try again later
  const ignoredNotice = new Set<string>();
  let hadTrouble = false;
  let didWork = false;
  let stopping = false;

  process.on("SIGINT", () => {
    if (stopping) process.exit(130);
    stopping = true;
    killCurrent();
    ui.info("");
    ui.info("Stopping. Finished work is saved; run Studio again to continue.");
    setTimeout(() => process.exit(130), 300);
  });

  ui.info(`Drop video files into:  ${dirs.incoming}`);

  /** One pass over incoming/. Returns how many files are still waiting (copying or to be retried). */
  async function pass(): Promise<number> {
    let waiting = 0;
    const names = (await readdir(dirs.incoming).catch(() => [] as string[])).sort();
    for (const name of names) {
      if (stopping) break;
      const file = path.join(dirs.incoming, name);
      if (finished.has(name)) continue;
      if (!isVideoFile(name)) {
        const ext = fileExt(name);
        const quiet = name.startsWith(".") || ext === "json" || TEMP_EXTENSIONS.includes(ext);
        if (!quiet && !ignoredNotice.has(name)) {
          ignoredNotice.add(name);
          const isFile = await stat(file).then((s) => s.isFile(), () => false);
          if (isFile) ui.warn(`Ignoring "${name}": it is not a video type Studio knows (mp4, mov, mkv, webm, avi ...).`);
        }
        continue;
      }
      const due = retryAt.get(name);
      if (due && Date.now() < due) {
        if (!flags.once) waiting++;
        continue;
      }
      if (!(await tracker.isReady(file))) {
        waiting++;
        continue;
      }

      let outcome;
      didWork = true;
      try {
        outcome = await processFile(ctx, file);
      } catch (e) {
        if (e instanceof AuthError) {
          ui.error("The site stopped accepting the token (it was probably revoked). Uploading is paused.");
          tokenHelp();
          ui.info("  Videos already processed are saved and will upload on the next start.");
          await settle();
          process.exit(1);
        }
        if (e instanceof ToolMissingError) {
          ui.error(`${e.tool} could not be started. Reinstall ffmpeg (winget install Gyan.FFmpeg) and start Studio again.`);
          process.exit(1);
        }
        if (stopping) break;
        // processFile handles its own errors; this is a last safety net so the watcher never dies.
        ui.error(`"${name}" hit an unexpected problem and was skipped: ${(e as Error)?.message ?? e}`);
        outcome = "failed" as const;
        finished.add(name);
      }
      tracker.forget(file);
      if (outcome === "dry") finished.add(name);
      else if (outcome === "later") {
        hadTrouble = true;
        retryAt.set(name, Date.now() + RETRY_LATER_MS);
        if (!flags.once) {
          waiting++;
          ui.info("  Studio will try again in about a minute.");
        } else ui.info('  Run "npm run studio" again later to continue this upload.');
      } else if (outcome === "failed") {
        hadTrouble = true;
        // If the file is still here it could not be moved to failed/: do not loop on it.
        if (await stat(file).then(() => true, () => false)) finished.add(name);
      } else retryAt.delete(name);
    }
    return waiting;
  }

  if (flags.once) {
    // Keep passing until nothing is still copying; then exit.
    for (;;) {
      const waiting = await pass();
      if (stopping || waiting === 0) break;
      await sleep(1000);
    }
    ui.info("");
    ui.info(hadTrouble ? "Finished, but some videos need attention (see the messages above)." : "All done.");
    await settle();
    process.exit(hadTrouble ? 1 : 0);
  }

  // Watch mode: fs.watch wakes us quickly, polling is the safety net (network drives, missed events).
  let wake: (() => void) | null = null;
  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(dirs.incoming, () => wake?.());
    watcher.on("error", () => {
      watcher?.close();
      watcher = null;
    });
  } catch {
    /* polling alone still works */
  }

  let announcedIdle = false;
  while (!stopping) {
    let waiting = 0;
    try {
      waiting = await pass();
    } catch (e) {
      ui.error(`Something went wrong while checking the incoming folder: ${(e as Error)?.message ?? e}`);
    }
    if (didWork) announcedIdle = false;
    didWork = false;
    if (waiting === 0 && !announcedIdle) {
      ui.info("");
      ui.info("Waiting for new videos... (press Ctrl+C to stop)");
      announcedIdle = true;
    } else if (waiting > 0) announcedIdle = false;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, waiting > 0 ? 1000 : POLL_MS);
      wake = () => {
        clearTimeout(t);
        setTimeout(resolve, 250); // small debounce: copies fire many events
      };
    });
    wake = null;
  }
}

main().catch((e) => {
  ui.error(`YoYo Studio stopped unexpectedly: ${(e as Error)?.message ?? e}`);
  process.exit(1);
});
