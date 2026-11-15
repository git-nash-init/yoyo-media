import "server-only";
import { prisma } from "@/lib/db";
import { channelLogoUrl, modelPhotoUrl } from "@/lib/media/urls";
import type { ChannelRef } from "./types";
import { listVideos, type VideoPage } from "./videos";

// Every function here takes the SESSION user's id from the caller (never from request input).

export async function isFollowingChannel(userId: string | undefined, channelId: string): Promise<boolean> {
  if (!userId) return false;
  return (await prisma.follow.count({ where: { userId, channelId } })) > 0;
}

export async function isFollowingModel(userId: string | undefined, modelId: string): Promise<boolean> {
  if (!userId) return false;
  return (await prisma.follow.count({ where: { userId, modelId } })) > 0;
}

export type Following = {
  channels: ChannelRef[];
  models: { id: string; slug: string; name: string; photo: string }[];
};

export async function listFollowing(userId: string): Promise<Following> {
  const rows = await prisma.follow.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      channel: { select: { id: true, slug: true, name: true, logoPath: true } },
      model: { select: { id: true, slug: true, name: true, photoPath: true } },
    },
  });
  const out: Following = { channels: [], models: [] };
  for (const r of rows) {
    if (r.channel)
      out.channels.push({ id: r.channel.id, slug: r.channel.slug, name: r.channel.name, logo: channelLogoUrl(r.channel) });
    if (r.model)
      out.models.push({ id: r.model.id, slug: r.model.slug, name: r.model.name, photo: modelPhotoUrl(r.model) });
  }
  return out;
}

/** Latest published videos from the channels and models this user follows. */
export async function listFollowingFeed(userId: string, following: Following, page: number): Promise<VideoPage> {
  const channelIds = following.channels.map((c) => c.id);
  const modelIds = following.models.map((m) => m.id);
  if (!channelIds.length && !modelIds.length) {
    return listVideos({ id: { in: [] } }, 1);
  }
  return listVideos(
    {
      type: "LONG",
      OR: [
        ...(channelIds.length ? [{ channelId: { in: channelIds } }] : []),
        ...(modelIds.length ? [{ models: { some: { modelId: { in: modelIds } } } }] : []),
      ],
    },
    page,
  );
}
