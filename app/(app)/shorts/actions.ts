"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/ratelimit";
import { listShorts } from "@/lib/queries/videos";
import type { ShortItem } from "@/lib/queries/types";

const cursorSchema = z.string().min(1).max(64).regex(/^[a-z0-9]+$/i);

/** Next batch for the shorts feed. Subscribers only — re-checked here, not just on the page. */
export async function loadMoreShortsAction(
  cursor: string,
): Promise<{ ok: true; items: ShortItem[]; nextCursor: string | null } | { ok: false; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again to keep watching." };
  if (!user.isSubscriber) return { ok: false, error: "A subscription is needed to watch shorts." };

  const parsed = cursorSchema.safeParse(cursor);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };

  const rl = await rateLimit(`shorts:${user.id}`, 120, 60);
  if (!rl.ok) return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };

  try {
    const { items, nextCursor } = await listShorts(parsed.data, user.id);
    return { ok: true, items, nextCursor };
  } catch {
    // An unknown cursor (e.g. the video was unpublished) makes Prisma throw.
    return { ok: false, error: "We couldn't load more shorts. This is on our side." };
  }
}
