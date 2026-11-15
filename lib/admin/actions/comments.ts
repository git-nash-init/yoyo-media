"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { idSchema, type ActionResult } from "@/lib/admin/logic";

const BAD_INPUT: ActionResult = { ok: false, error: "The request was not valid. Reload the page and try again." };

function revalidateComments(videoId?: string, userId?: string) {
  revalidatePath("/admin/comments");
  revalidatePath("/admin");
  if (videoId) revalidatePath(`/admin/videos/${videoId}`);
  if (userId) revalidatePath(`/admin/subscribers/${userId}`);
  // Public pages that show comments (owned by other parts of the app).
  revalidatePath("/", "layout");
}

/** Soft delete: the comment is hidden from viewers but kept so moderation stays auditable. */
export async function deleteCommentAction(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(id).success) return BAD_INPUT;

  const comment = await prisma.comment.findUnique({ where: { id }, select: { id: true, videoId: true, userId: true, deletedAt: true } });
  if (!comment) return { ok: false, error: "This comment no longer exists." };
  if (comment.deletedAt) return { ok: false, error: "This comment was already deleted." };

  await prisma.comment.update({ where: { id }, data: { deletedAt: new Date(), deletedById: admin.id } });
  await audit(admin.id, "comment.delete", `comment:${id}`, { videoId: comment.videoId, authorId: comment.userId });
  revalidateComments(comment.videoId, comment.userId);
  return { ok: true, message: "Comment deleted. Viewers can no longer see it." };
}

export async function restoreCommentAction(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(id).success) return BAD_INPUT;

  const comment = await prisma.comment.findUnique({ where: { id }, select: { id: true, videoId: true, userId: true, deletedAt: true } });
  if (!comment) return { ok: false, error: "This comment no longer exists." };
  if (!comment.deletedAt) return { ok: false, error: "This comment is already visible." };

  await prisma.comment.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
  await audit(admin.id, "comment.restore", `comment:${id}`, { videoId: comment.videoId, authorId: comment.userId });
  revalidateComments(comment.videoId, comment.userId);
  return { ok: true, message: "Comment restored. It is visible again." };
}

/** Soft-deletes every visible comment written by one user. */
export async function deleteUserCommentsAction(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(userId).success) return BAD_INPUT;

  const res = await prisma.comment.updateMany({
    where: { userId, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: admin.id },
  });
  if (res.count === 0) return { ok: false, error: "This user has no visible comments left to delete." };

  await audit(admin.id, "comment.delete_all_by_user", `user:${userId}`, { count: res.count });
  revalidateComments(undefined, userId);
  return { ok: true, message: `${res.count} comments deleted.` };
}
