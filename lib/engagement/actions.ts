"use server";

import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/ip";
import { rateLimit } from "@/lib/security/ratelimit";
import { countComments, countLikes, listComments, toCommentItem } from "./queries";
import type { AddCommentResult, CommentsPageResult, DeleteCommentResult, LikeResult } from "./types";
import { validateCommentBody } from "./validation";

const id = z.string().min(1).max(64).regex(/^[a-z0-9]+$/i);

/** Signed-in SUBSCRIBER, or the reason they are not (so the UI can send them to the right place). */
async function subscriber() {
  const user = await getCurrentUser();
  if (!user) return { user: null, fail: { ok: false as const, error: "Sign in to do that.", gate: "login" as const } };
  if (!user.isSubscriber)
    return { user: null, fail: { ok: false as const, error: "This is for subscribers.", gate: "subscribe" as const } };
  return { user, fail: null };
}

async function publishedVideo(videoId: string) {
  return prisma.video.findFirst({ where: { id: videoId, status: "PUBLISHED" }, select: { id: true } });
}

// ---------- Likes ----------

const likeSchema = z.object({ videoId: id, like: z.boolean() });

/** Like/unlike. `like` is the desired end state, so retries and double-taps are idempotent. */
export async function setLikeAction(input: z.input<typeof likeSchema>): Promise<LikeResult> {
  const { user, fail } = await subscriber();
  if (!user) return fail;

  const parsed = likeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { videoId, like } = parsed.data;

  const rl = await rateLimit(`like:${user.id}`, 60, 60);
  if (!rl.ok) return { ok: false, error: `Slow down a little. Try again in ${rl.retryAfterSec}s.` };

  if (!(await publishedVideo(videoId))) return { ok: false, error: "This video is no longer available." };

  if (like) {
    await prisma.videoLike.upsert({
      where: { userId_videoId: { userId: user.id, videoId } },
      create: { userId: user.id, videoId },
      update: {},
    });
  } else {
    await prisma.videoLike.deleteMany({ where: { userId: user.id, videoId } });
  }
  return { ok: true, liked: like, likeCount: await countLikes(videoId) };
}

// ---------- Comments ----------

const listSchema = z.object({ videoId: id, cursor: id.nullable() });

/** Read comments. Public like the rest of the catalogue text, so it is rate-limited per IP. */
export async function loadCommentsAction(input: z.input<typeof listSchema>): Promise<CommentsPageResult> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };

  const rl = await rateLimit(`comments-read:${await clientIp()}`, 120, 60);
  if (!rl.ok) return { ok: false, error: `Too many requests. Try again in ${rl.retryAfterSec}s.` };

  const user = await getCurrentUser();
  try {
    const page = await listComments(parsed.data.videoId, parsed.data.cursor, user);
    return { ok: true, ...page };
  } catch {
    return { ok: false, error: "We couldn't load comments. This is on our side." };
  }
}

const addSchema = z.object({ videoId: id, body: z.string().max(4000) });

export async function addCommentAction(input: z.input<typeof addSchema>): Promise<AddCommentResult> {
  const { user, fail } = await subscriber();
  if (!user) return fail;

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That comment was not valid." };

  // Trim, reject empty/whitespace-only and anything over 500 characters.
  const body = validateCommentBody(parsed.data.body);
  if (!body.ok) return { ok: false, error: body.error };

  if (!(await publishedVideo(parsed.data.videoId))) return { ok: false, error: "This video is no longer available." };

  const rl = await rateLimit(`comment:${user.id}`, 10, 300);
  if (!rl.ok) {
    const mins = Math.ceil(rl.retryAfterSec / 60);
    return { ok: false, error: `You are commenting very quickly. Try again in about ${mins} min.` };
  }

  const row = await prisma.comment.create({
    data: { videoId: parsed.data.videoId, userId: user.id, body: body.body },
    select: { id: true, body: true, createdAt: true, user: { select: { id: true, name: true } } },
  });
  return { ok: true, comment: toCommentItem(row, user), total: await countComments(parsed.data.videoId) };
}

const deleteSchema = z.object({ commentId: id });

/** Soft-delete. Authors can remove their own comment; admins can remove any (audited). */
export async function deleteCommentAction(input: z.input<typeof deleteSchema>): Promise<DeleteCommentResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to do that." };

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };

  const rl = await rateLimit(`comment-delete:${user.id}`, 30, 60);
  if (!rl.ok) return { ok: false, error: `Slow down a little. Try again in ${rl.retryAfterSec}s.` };

  const comment = await prisma.comment.findUnique({
    where: { id: parsed.data.commentId },
    select: { id: true, userId: true, videoId: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) return { ok: false, error: "That comment was already removed." };

  const isOwner = comment.userId === user.id;
  if (!isOwner && user.role !== "ADMIN") return { ok: false, error: "You can only delete your own comments." };

  await prisma.comment.updateMany({
    where: { id: comment.id, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: user.id },
  });
  if (!isOwner) {
    await audit(user.id, "comment.delete", `comment:${comment.id}`, {
      videoId: comment.videoId,
      authorId: comment.userId,
    });
  }
  return { ok: true, total: await countComments(comment.videoId) };
}
