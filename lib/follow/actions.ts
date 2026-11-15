"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/ratelimit";

const schema = z.object({
  kind: z.enum(["channel", "model"]),
  id: z.string().min(1).max(64),
  follow: z.boolean(),
});

export type FollowResult =
  | { ok: true; following: boolean }
  | { ok: false; error: string; loginRequired?: boolean };

/**
 * Follow or unfollow a channel/model. `follow` is the desired end state, so a
 * double-click or a retry is idempotent. Requires sign-in (not a subscription);
 * the row is always written for the session user, never an id from the client.
 */
export async function setFollowAction(input: z.input<typeof schema>): Promise<FollowResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to follow.", loginRequired: true };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { kind, id, follow } = parsed.data;

  const rl = await rateLimit(`follow:${user.id}`, 60, 60);
  if (!rl.ok) return { ok: false, error: `Slow down a little. Try again in ${rl.retryAfterSec}s.` };

  const target =
    kind === "channel"
      ? await prisma.channel.findUnique({ where: { id }, select: { slug: true } })
      : await prisma.model.findUnique({ where: { id }, select: { slug: true } });
  if (!target) return { ok: false, error: "That page no longer exists." };

  const where = kind === "channel" ? { userId: user.id, channelId: id } : { userId: user.id, modelId: id };
  if (follow) {
    const exists = await prisma.follow.findFirst({ where, select: { id: true } });
    if (!exists) {
      // The unique index makes a concurrent duplicate fail harmlessly.
      await prisma.follow.create({ data: where }).catch(() => {});
    }
  } else {
    await prisma.follow.deleteMany({ where });
  }

  revalidatePath("/subscriptions");
  revalidatePath(kind === "channel" ? `/channel/${target.slug}` : `/models/${target.slug}`);
  return { ok: true, following: follow };
}
