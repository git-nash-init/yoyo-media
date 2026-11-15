// Pure upload helpers: chunk planning, retry timing, progress maths and formatting.

export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
export const MAX_TRIES = 5;

export type Chunk = { offset: number; length: number };

/** Chunks still to send for a file of `totalSize`, starting at `from` (bytes the server already has). */
export function planChunks(totalSize: number, chunkSize: number, from = 0): Chunk[] {
  if (!(chunkSize > 0)) throw new Error("chunkSize must be positive");
  const chunks: Chunk[] = [];
  for (let offset = Math.max(0, from); offset < totalSize; offset += chunkSize)
    chunks.push({ offset, length: Math.min(chunkSize, totalSize - offset) });
  return chunks;
}

export function nextChunk(totalSize: number, chunkSize: number, received: number): Chunk | null {
  if (received >= totalSize) return null;
  return { offset: received, length: Math.min(chunkSize, totalSize - received) };
}

/** Exponential backoff: 1 s, 2 s, 4 s, 8 s, 16 s ... capped at 30 s. `attempt` starts at 1. */
export function backoffMs(attempt: number, baseMs = 1000, capMs = 30_000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
}

/** Which HTTP statuses are worth retrying (server hiccups, timeouts, rate limits). */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let n = Math.max(0, bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 || n >= 100 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "--";
  const s = Math.round(totalSec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Speed over a sliding window of (time, bytes) samples, so the ETA follows the current network. */
export class SpeedMeter {
  private samples: { t: number; bytes: number }[] = [];
  constructor(private windowMs = 15_000) {}

  add(nowMs: number, totalBytesSent: number) {
    this.samples.push({ t: nowMs, bytes: totalBytesSent });
    while (this.samples.length > 2 && nowMs - this.samples[0].t > this.windowMs) this.samples.shift();
  }

  /** Bytes per second, or 0 when not enough data yet. */
  bytesPerSec(): number {
    if (this.samples.length < 2) return 0;
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? Math.max(0, (b.bytes - a.bytes) / dt) : 0;
  }

  etaSec(remainingBytes: number): number {
    const bps = this.bytesPerSec();
    return bps > 0 ? remainingBytes / bps : NaN;
  }
}

export function uploadLine(sent: number, total: number, bps: number, etaSec: number): string {
  const pct = total > 0 ? Math.floor((sent / total) * 100) : 100;
  const speed = bps > 0 ? `${formatBytes(bps)}/s` : "-- /s";
  const eta = sent >= total ? "done" : `about ${formatDuration(etaSec)} left`;
  return `${String(pct).padStart(3)}%  ${formatBytes(sent)} of ${formatBytes(total)}  ${speed}  ${eta}`;
}
