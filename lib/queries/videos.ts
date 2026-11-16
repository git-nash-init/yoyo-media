import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { channelLogoUrl, modelPhotoUrl, previewUrl, seriesPosterUrl, thumbUrl } from "@/lib/media/urls";
import { buildQualities } from "@/lib/media/quality";
import { PAGE_SIZE, paginate, type PageInfo } from "./pagination";
import { getEngagement } from "@/lib/engagement/queries";
import type { ChannelRef, ShortItem, ShortOwner, VideoCardData } from "./types";

/** Every viewer-facing query goes through this filter: drafts are never listed or shown. */
export const PUBLISHED = { status: "PUBLISHED" } as const satisfies Prisma.VideoWhereInput;

const NEWEST: Prisma.VideoOrderByWithRelationInput[] = [{ publishedAt: "desc" }, { id: "desc" }];

export const cardSelect = {
  id: true,
  slug: true,
  title: true,
  durationSec: true,
  publishedAt: true,
  updatedAt: true,
  thumbPath: true,
  previewPath: true,
  episodeNo: true,
  channel: { select: { id: true, slug: true, name: true, logoPath: true } },
} satisfies Prisma.VideoSelect;

type CardRow = Prisma.VideoGetPayload<{ select: typeof cardSelect }>;

export function toChannelRef(c: { id: string; slug: string; name: string; logoPath: string | null }): ChannelRef {
  return { id: c.id, slug: c.slug, name: c.name, logo: channelLogoUrl(c) };
}

/** Strip storage paths: components only ever receive ready-made media URLs. */
export function toCard(v: CardRow): VideoCardData {
  return {
    id: v.id,
    slug: v.slug,
    title: v.title,
    durationSec: v.durationSec,
    ago: v.publishedAt ? timeAgo(v.publishedAt) : null,
    thumb: thumbUrl(v),
    preview: previewUrl(v),
    episodeNo: v.episodeNo,
    channel: v.channel ? toChannelRef(v.channel) : null,
  };
}

export type VideoPage = { items: VideoCardData[]; info: PageInfo };

/** Shared paginated listing. `where` is always AND-ed with the PUBLISHED filter. */
export async function listVideos(
  where: Prisma.VideoWhereInput,
  page: number,
  opts: { pageSize?: number; orderBy?: Prisma.VideoOrderByWithRelationInput[] } = {},
): Promise<VideoPage> {
  const full: Prisma.VideoWhereInput = { AND: [PUBLISHED, where] };
  const total = await prisma.video.count({ where: full });
  const info = paginate(total, page, opts.pageSize ?? PAGE_SIZE);
  const rows = total
    ? await prisma.video.findMany({
        where: full,
        orderBy: opts.orderBy ?? NEWEST,
        skip: info.skip,
        take: info.take,
        select: cardSelect,
      })
    : [];
  return { items: rows.map(toCard), info };
}

export const listLatestVideos = (page: number) => listVideos({ type: "LONG" }, page);

export const listChannelVideos = (channelId: string, page: number) => listVideos({ channelId }, page);

export const listModelVideos = (modelId: string, page: number) =>
  listVideos({ models: { some: { modelId } } }, page);

/** Most-viewed long videos, used as suggestions on search / empty states. */
export async function listPopularVideos(take = 8): Promise<VideoCardData[]> {
  const rows = await prisma.video.findMany({
    where: { ...PUBLISHED, type: "LONG" },
    orderBy: [{ views: "desc" }, { publishedAt: "desc" }],
    take,
    select: cardSelect,
  });
  return rows.map(toCard);
}

/** Unfinished videos for the signed-in user, most recently watched first. */
export async function listContinueWatching(userId: string, take = 8): Promise<VideoCardData[]> {
  const rows = await prisma.watchProgress.findMany({
    where: { userId, positionSec: { gt: 5 }, video: { ...PUBLISHED, type: "LONG" } },
    orderBy: { updatedAt: "desc" },
    take: take * 2,
    select: { positionSec: true, video: { select: cardSelect } },
  });
  return rows
    .filter((r) => r.video.durationSec <= 0 || r.positionSec < r.video.durationSec * 0.95)
    .slice(0, take)
    .map((r) => ({
      ...toCard(r.video),
      progressPct:
        r.video.durationSec > 0 ? Math.min(100, Math.round((r.positionSec / r.video.durationSec) * 100)) : 0,
    }));
}

/** Everything the watch page needs for one published video. Returns null for drafts/unknown slugs. */
export const getWatchVideo = cache(async (slug: string) => {
  const v = await prisma.video.findFirst({
    where: { slug, ...PUBLISHED },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      type: true,
      durationSec: true,
      heightPx: true,
      views: true,
      publishedAt: true,
      updatedAt: true,
      thumbPath: true,
      previewPath: true,
      episodeNo: true,
      channelId: true,
      seriesId: true,
      channel: { select: { id: true, slug: true, name: true, logoPath: true } },
      series: { select: { id: true, slug: true, title: true, posterPath: true } },
      models: { select: { model: { select: { id: true, slug: true, name: true, photoPath: true } } } },
      renditions: { select: { height: true }, orderBy: { height: "desc" } },
    },
  });
  if (!v) return null;
  return {
    id: v.id,
    slug: v.slug,
    title: v.title,
    description: v.description,
    type: v.type,
    durationSec: v.durationSec,
    /** Quality choices, best first: the main file (height 0 means "the file as uploaded") then each lower copy. */
    qualities: buildQualities(v.heightPx, v.renditions.map((r) => r.height)),
    views: v.views,
    publishedAt: v.publishedAt,
    episodeNo: v.episodeNo,
    channelId: v.channelId,
    seriesId: v.seriesId,
    thumb: thumbUrl(v),
    preview: previewUrl(v),
    channel: v.channel ? toChannelRef(v.channel) : null,
    series: v.series
      ? { id: v.series.id, slug: v.series.slug, title: v.series.title, poster: seriesPosterUrl(v.series) }
      : null,
    models: v.models.map(({ model }) => ({
      id: model.id,
      slug: model.slug,
      name: model.name,
      photo: modelPhotoUrl(model),
    })),
  };
});

export type WatchVideo = NonNullable<Awaited<ReturnType<typeof getWatchVideo>>>;

/** All published episodes of a series in episode order. */
export async function listSeriesEpisodes(seriesId: string): Promise<VideoCardData[]> {
  const rows = await prisma.video.findMany({
    where: { seriesId, ...PUBLISHED },
    orderBy: [{ episodeNo: "asc" }, { publishedAt: "asc" }, { id: "asc" }],
    take: 200,
    select: cardSelect,
  });
  // MySQL sorts NULL first; un-numbered episodes belong at the end.
  return [...rows.filter((r) => r.episodeNo != null), ...rows.filter((r) => r.episodeNo == null)].map(toCard);
}

/** Related videos: same series or channel first, topped up with the latest uploads. */
export async function listMoreLikeThis(
  video: { id: string; channelId: string | null; seriesId: string | null },
  take = 8,
): Promise<VideoCardData[]> {
  const related: Prisma.VideoWhereInput[] = [];
  if (video.seriesId) related.push({ seriesId: video.seriesId });
  if (video.channelId) related.push({ channelId: video.channelId });

  const rows = related.length
    ? await prisma.video.findMany({
        where: { ...PUBLISHED, type: "LONG", id: { not: video.id }, OR: related },
        orderBy: NEWEST,
        take,
        select: cardSelect,
      })
    : [];
  if (rows.length < take) {
    const more = await prisma.video.findMany({
      where: { ...PUBLISHED, type: "LONG", id: { notIn: [video.id, ...rows.map((r) => r.id)] } },
      orderBy: NEWEST,
      take: take - rows.length,
      select: cardSelect,
    });
    rows.push(...more);
  }
  return rows.map(toCard);
}

export async function getWatchPosition(userId: string, videoId: string): Promise<number> {
  const row = await prisma.watchProgress.findUnique({
    where: { userId_videoId: { userId, videoId } },
    select: { positionSec: true },
  });
  return row?.positionSec ?? 0;
}

export const SHORTS_PAGE = 8;

/**
 * Cursor-paginated shorts, newest first. `cursor` is the id of the last item already shown.
 * `userId` (optional) is only used to mark what the viewer already follows and likes.
 */
export async function listShorts(
  cursor: string | null,
  userId: string | null,
  take = SHORTS_PAGE,
): Promise<{ items: ShortItem[]; nextCursor: string | null }> {
  const rows = await prisma.video.findMany({
    where: { ...PUBLISHED, type: "SHORT" },
    orderBy: NEWEST,
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      slug: true,
      title: true,
      updatedAt: true,
      thumbPath: true,
      channel: { select: { id: true, slug: true, name: true, logoPath: true } },
      models: {
        take: 1,
        orderBy: { model: { name: "asc" } },
        select: { model: { select: { id: true, slug: true, name: true, photoPath: true } } },
      },
    },
  });
  const page = rows.slice(0, take);

  const channelIds = [...new Set(page.map((r) => r.channel?.id).filter((x): x is string => !!x))];
  const modelIds = [...new Set(page.filter((r) => !r.channel).map((r) => r.models[0]?.model.id).filter((x): x is string => !!x))];
  const [follows, engagement] = await Promise.all([
    userId && (channelIds.length || modelIds.length)
      ? prisma.follow.findMany({
          where: { userId, OR: [{ channelId: { in: channelIds } }, { modelId: { in: modelIds } }] },
          select: { channelId: true, modelId: true },
        })
      : Promise.resolve([]),
    getEngagement(
      page.map((r) => r.id),
      userId,
    ),
  ]);
  const followed = new Set(follows.map((f) => (f.channelId ? `c:${f.channelId}` : `m:${f.modelId}`)));

  return {
    items: page.map((r) => {
      const model = r.models[0]?.model;
      const owner: ShortOwner | null = r.channel
        ? {
            kind: "channel",
            id: r.channel.id,
            name: r.channel.name,
            href: `/channel/${r.channel.slug}`,
            avatar: channelLogoUrl(r.channel),
            following: followed.has(`c:${r.channel.id}`),
          }
        : model
          ? {
              kind: "model",
              id: model.id,
              name: model.name,
              href: `/models/${model.slug}`,
              avatar: modelPhotoUrl(model),
              following: followed.has(`m:${model.id}`),
            }
          : null;
      const e = engagement.get(r.id);
      return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        thumb: thumbUrl(r),
        owner,
        likeCount: e?.likeCount ?? 0,
        commentCount: e?.commentCount ?? 0,
        liked: e?.liked ?? false,
      };
    }),
    nextCursor: rows.length > take ? page[page.length - 1].id : null,
  };
}

/** Thumbnails only (no ids that matter, no stream URLs) for the blurred backdrop behind the shorts paywall. */
export async function listShortThumbs(take = 6): Promise<string[]> {
  const rows = await prisma.video.findMany({
    where: { ...PUBLISHED, type: "SHORT" },
    orderBy: NEWEST,
    take,
    select: { id: true, updatedAt: true, thumbPath: true },
  });
  return rows.map((r) => thumbUrl(r));
}

export async function countShorts(): Promise<number> {
  return prisma.video.count({ where: { ...PUBLISHED, type: "SHORT" } });
}
