import "server-only";
import { prisma } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import type { CommentItem, EngagementSummary } from "./types";

export const COMMENTS_PAGE = 20;

const visible = { deletedAt: null } as const;

/** Like/comment counts (and whether `userId` liked) for a set of videos, in three queries. */
export async function getEngagement(videoIds: string[], userId: string | null): Promise<Map<string, EngagementSummary>> {
  const out = new Map<string, EngagementSummary>();
  for (const id of videoIds) out.set(id, { likeCount: 0, commentCount: 0, liked: false });
  if (!videoIds.length) return out;

  const [likes, comments, mine] = await Promise.all([
    prisma.videoLike.groupBy({ by: ["videoId"], where: { videoId: { in: videoIds } }, _count: { _all: true } }),
    prisma.comment.groupBy({ by: ["videoId"], where: { videoId: { in: videoIds }, ...visible }, _count: { _all: true } }),
    userId
      ? prisma.videoLike.findMany({ where: { userId, videoId: { in: videoIds } }, select: { videoId: true } })
      : Promise.resolve([]),
  ]);
  for (const l of likes) out.get(l.videoId)!.likeCount = l._count._all;
  for (const c of comments) out.get(c.videoId)!.commentCount = c._count._all;
  for (const m of mine) out.get(m.videoId)!.liked = true;
  return out;
}

export function countLikes(videoId: string) {
  return prisma.videoLike.count({ where: { videoId } });
}

export function countComments(videoId: string) {
  return prisma.comment.count({ where: { videoId, ...visible } });
}

type Row = { id: string; body: string; createdAt: Date; user: { id: string; name: string } };

/** Shape a row for the client: the author's id is used only to decide `canDelete`, then dropped. */
export function toCommentItem(c: Row, viewer: { id: string; role: "USER" | "ADMIN" } | null): CommentItem {
  return {
    id: c.id,
    body: c.body,
    authorName: c.user.name,
    ago: timeAgo(c.createdAt),
    canDelete: !!viewer && (viewer.id === c.user.id || viewer.role === "ADMIN"),
  };
}

/** Newest-first comments for a PUBLISHED video. Soft-deleted comments are never returned. */
export async function listComments(
  videoId: string,
  cursor: string | null,
  viewer: { id: string; role: "USER" | "ADMIN" } | null,
  take = COMMENTS_PAGE,
): Promise<{ items: CommentItem[]; nextCursor: string | null; total: number }> {
  const where = { videoId, ...visible, video: { status: "PUBLISHED" as const } };
  const [rows, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      // Only what the UI shows. Never the author's email.
      select: { id: true, body: true, createdAt: true, user: { select: { id: true, name: true } } },
    }),
    prisma.comment.count({ where }),
  ]);
  const page = rows.slice(0, take);
  return {
    items: page.map((r) => toCommentItem(r, viewer)),
    nextCursor: rows.length > take ? page[page.length - 1].id : null,
    total,
  };
}
