import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiSubscriber } from "@/lib/auth/guards";
import { forbidCrossOrigin } from "@/lib/security/origin";
import { rateLimit } from "@/lib/security/ratelimit";

export const dynamic = "force-dynamic";

const schema = z.object({
  videoId: z.string().min(1).max(64),
  positionSec: z.number().int().min(0).max(60 * 60 * 24),
});

/** Save the signed-in subscriber's watch position. Always written for the session user. */
export async function POST(req: Request) {
  const blocked = forbidCrossOrigin(req);
  if (blocked) return blocked;

  const user = await apiSubscriber();
  if (user instanceof Response) return user;

  const rl = await rateLimit(`progress:${user.id}`, 60, 60);
  if (!rl.ok)
    return Response.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "BAD_REQUEST" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid input", code: "BAD_REQUEST" }, { status: 400 });

  const video = await prisma.video.findFirst({
    where: { id: parsed.data.videoId, status: "PUBLISHED" },
    select: { id: true, durationSec: true },
  });
  if (!video) return Response.json({ error: "Video not found", code: "NOT_FOUND" }, { status: 404 });

  const positionSec =
    video.durationSec > 0 ? Math.min(parsed.data.positionSec, video.durationSec) : parsed.data.positionSec;

  await prisma.watchProgress.upsert({
    where: { userId_videoId: { userId: user.id, videoId: video.id } },
    create: { userId: user.id, videoId: video.id, positionSec },
    update: { positionSec },
  });

  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
