"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { saveUploadedImage } from "@/lib/storage";
import {
  fieldErrorsOf,
  idSchema,
  resolveSlug,
  videoFormSchema,
  type ActionResult,
} from "@/lib/admin/logic";
import { candidateList, formFile, formText, removeFileQuietly, removeVideoFiles, slugTaken } from "@/lib/admin/server";

const NOT_FOUND: ActionResult = { ok: false, error: "This video no longer exists. It may have been deleted in another tab." };
const BAD_INPUT: ActionResult = { ok: false, error: "The request was not valid. Reload the page and try again." };

function revalidateVideo(id?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/videos");
  revalidatePath("/admin/shorts");
  if (id) revalidatePath(`/admin/videos/${id}`);
  // Public pages that list videos (owned by other parts of the app).
  revalidatePath("/", "layout");
}

export async function setVideoStatusAction(id: string, publish: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = z.object({ id: idSchema, publish: z.boolean() }).safeParse({ id, publish });
  if (!parsed.success) return BAD_INPUT;

  const video = await prisma.video.findUnique({ where: { id: parsed.data.id }, select: { id: true, publishedAt: true } });
  if (!video) return NOT_FOUND;

  await prisma.video.update({
    where: { id: video.id },
    data: parsed.data.publish
      ? { status: "PUBLISHED", publishedAt: video.publishedAt ?? new Date() }
      : { status: "DRAFT" },
  });
  await audit(admin.id, parsed.data.publish ? "video.publish" : "video.unpublish", `video:${video.id}`);
  revalidateVideo(video.id);
  return { ok: true, message: parsed.data.publish ? "Published." : "Moved back to drafts." };
}

export async function setVideoFeaturedAction(id: string, featured: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = z.object({ id: idSchema, featured: z.boolean() }).safeParse({ id, featured });
  if (!parsed.success) return BAD_INPUT;

  const video = await prisma.video.findUnique({ where: { id: parsed.data.id }, select: { id: true } });
  if (!video) return NOT_FOUND;

  await prisma.video.update({ where: { id: video.id }, data: { isFeatured: parsed.data.featured } });
  await audit(admin.id, parsed.data.featured ? "video.feature" : "video.unfeature", `video:${video.id}`);
  revalidateVideo(video.id);
  return { ok: true, message: parsed.data.featured ? "Added to the landing carousel." : "Removed from the landing carousel." };
}

/** Deletes the database row AND every file on disk. `thenRedirect` sends the admin back to the list. */
export async function deleteVideoAction(id: string, thenRedirect = false): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = z.object({ id: idSchema, thenRedirect: z.boolean() }).safeParse({ id, thenRedirect });
  if (!parsed.success) return BAD_INPUT;

  const video = await prisma.video.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      title: true,
      type: true,
      filePath: true,
      previewPath: true,
      thumbPath: true,
      thumbCandidates: true,
      renditions: { select: { filePath: true } },
    },
  });
  if (!video) return NOT_FOUND;

  await prisma.video.delete({ where: { id: video.id } });
  await removeVideoFiles(video);
  await audit(admin.id, "video.delete", `video:${video.id}`, { title: video.title, type: video.type });
  revalidateVideo();
  if (parsed.data.thenRedirect) redirect(video.type === "SHORT" ? "/admin/shorts?deleted=1" : "/admin/videos?deleted=1");
  return { ok: true, message: "Video and its files were deleted." };
}

export async function updateVideoAction(id: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(id).success) return BAD_INPUT;

  const parsed = videoFormSchema.safeParse({
    title: formText(formData, "title"),
    slug: formText(formData, "slug"),
    description: formText(formData, "description"),
    type: formText(formData, "type"),
    status: formText(formData, "status"),
    channelId: formText(formData, "channelId"),
    seriesId: formText(formData, "seriesId"),
    episodeNo: formText(formData, "episodeNo"),
    modelIds: formData.getAll("modelIds").filter((v): v is string => typeof v === "string"),
    isFeatured: formText(formData, "isFeatured"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Some fields need attention. Fix the highlighted fields and save again.", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  const v = parsed.data;

  const video = await prisma.video.findUnique({ where: { id }, select: { id: true, publishedAt: true, status: true } });
  if (!video) return NOT_FOUND;

  const slug = resolveSlug(v.slug, v.title);
  const fieldErrors: Record<string, string> = {};
  if (await slugTaken("video", slug, id)) {
    fieldErrors.slug = `“${slug}” is already used by another video. Change the slug (for example add a number).`;
  }
  if (v.channelId && !(await prisma.channel.count({ where: { id: v.channelId } }))) {
    fieldErrors.channelId = "That channel no longer exists. Pick another one.";
  }
  if (v.seriesId && !(await prisma.series.count({ where: { id: v.seriesId } }))) {
    fieldErrors.seriesId = "That series no longer exists. Pick another one.";
  }
  const modelIds = [...new Set(v.modelIds)];
  if (modelIds.length && (await prisma.model.count({ where: { id: { in: modelIds } } })) !== modelIds.length) {
    fieldErrors.modelIds = "One of the selected models no longer exists. Reload the page and pick again.";
  }
  if (Object.keys(fieldErrors).length) {
    return { ok: false, error: "Some fields need attention. Fix the highlighted fields and save again.", fieldErrors };
  }

  await prisma.$transaction([
    prisma.video.update({
      where: { id },
      data: {
        title: v.title,
        slug,
        description: v.description,
        type: v.type,
        status: v.status,
        channelId: v.channelId,
        seriesId: v.seriesId,
        episodeNo: v.seriesId ? v.episodeNo : null,
        isFeatured: v.isFeatured,
        publishedAt: v.status === "PUBLISHED" ? (video.publishedAt ?? new Date()) : video.publishedAt,
      },
    }),
    prisma.videoModel.deleteMany({ where: { videoId: id } }),
    ...(modelIds.length
      ? [prisma.videoModel.createMany({ data: modelIds.map((modelId) => ({ videoId: id, modelId })) })]
      : []),
  ]);

  await audit(admin.id, "video.update", `video:${id}`, { slug, status: v.status, type: v.type, featured: v.isFeatured });
  revalidateVideo(id);
  const justPublished = v.status === "PUBLISHED" && video.status !== "PUBLISHED";
  return {
    ok: true,
    message: justPublished
      ? "Saved and published. Subscribers can watch it now."
      : v.status === "PUBLISHED"
        ? "Changes saved. The video is live."
        : "Draft saved. Set status to Published when it is ready to go live.",
  };
}

/** Swap in a new thumbnail path, deleting the old file only if it was a custom upload (never a Studio candidate). */
async function replaceThumb(videoId: string, newPath: string) {
  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { thumbPath: true, thumbCandidates: true } });
  if (!video) return false;
  await prisma.video.update({ where: { id: videoId }, data: { thumbPath: newPath } });
  const candidates = candidateList(video.thumbCandidates);
  if (video.thumbPath && video.thumbPath !== newPath && !candidates.includes(video.thumbPath)) {
    await removeFileQuietly(video.thumbPath);
  }
  return true;
}

export async function pickThumbCandidateAction(id: string, index: number): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = z.object({ id: idSchema, index: z.number().int().min(0).max(50) }).safeParse({ id, index });
  if (!parsed.success) return BAD_INPUT;

  const video = await prisma.video.findUnique({ where: { id: parsed.data.id }, select: { thumbCandidates: true } });
  if (!video) return NOT_FOUND;
  const path = candidateList(video.thumbCandidates)[parsed.data.index];
  if (!path) return { ok: false, error: "That candidate is no longer available. Reload the page to see the current ones." };

  await replaceThumb(parsed.data.id, path);
  await audit(admin.id, "video.thumbnail.candidate", `video:${parsed.data.id}`, { index: parsed.data.index });
  revalidateVideo(parsed.data.id);
  return { ok: true, message: "Thumbnail updated." };
}

/** Used for both a custom image upload and a frame grabbed from the video in the browser (field name: "image"). */
export async function uploadThumbnailAction(id: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(id).success) return BAD_INPUT;

  const file = formFile(formData, "image");
  if (!file) return { ok: false, fieldErrors: { image: "Choose a JPG, PNG or WebP image first." } };

  const exists = await prisma.video.count({ where: { id } });
  if (!exists) return NOT_FOUND;

  const saved = await saveUploadedImage(file, "thumbs");
  if ("error" in saved) return { ok: false, fieldErrors: { image: saved.error } };

  const replaced = await replaceThumb(id, saved.path);
  if (!replaced) {
    await removeFileQuietly(saved.path);
    return NOT_FOUND;
  }
  const source = formText(formData, "source") === "frame" ? "frame" : "upload";
  await audit(admin.id, "video.thumbnail.upload", `video:${id}`, { source });
  revalidateVideo(id);
  return { ok: true, message: source === "frame" ? "Frame saved as the thumbnail." : "Thumbnail updated." };
}
