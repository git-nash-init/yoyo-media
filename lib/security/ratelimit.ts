import "server-only";
import { prisma } from "@/lib/db";

export type RateResult = { ok: boolean; remaining: number; retryAfterSec: number };

/**
 * Fixed-window rate limiter stored in MySQL (no Redis or in-memory state, so it
 * keeps working when the host sleeps or restarts the process).
 *
 *   const rl = await rateLimit(`login:${ip}`, 10, 600);
 *   if (!rl.ok) return { error: `Too many attempts. Try again in ${rl.retryAfterSec}s.` };
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateResult> {
  const now = new Date();
  const k = key.slice(0, 191);
  const row = await prisma.rateLimit.findUnique({ where: { key: k } });
  if (!row || now.getTime() - row.windowStart.getTime() >= windowSec * 1000) {
    await prisma.rateLimit.upsert({
      where: { key: k },
      create: { key: k, windowStart: now, count: 1 },
      update: { windowStart: now, count: 1 },
    });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  const retryAfterSec = Math.max(
    1,
    Math.ceil((row.windowStart.getTime() + windowSec * 1000 - now.getTime()) / 1000),
  );
  if (row.count >= limit) return { ok: false, remaining: 0, retryAfterSec };
  await prisma.rateLimit.update({ where: { key: k }, data: { count: { increment: 1 } } });
  return { ok: true, remaining: limit - row.count - 1, retryAfterSec };
}
