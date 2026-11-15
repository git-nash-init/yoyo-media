import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { channelLogoUrl, modelPhotoUrl, seriesPosterUrl } from "@/lib/media/urls";
import { PAGE_SIZE, paginate, type PageInfo } from "./pagination";
import type { ChannelTile, ModelTile, SeriesTile } from "./types";
import { PUBLISHED, toChannelRef } from "./videos";

const publishedVideoCount = { select: { videos: { where: PUBLISHED } } } as const;
const publishedModelVideoCount = { select: { videos: { where: { video: PUBLISHED } } } } as const;

// ---------- Channels ----------

/** All channels in admin-defined order, for the chips row. */
export async function listChannels(take = 60): Promise<ChannelTile[]> {
  const rows = await prisma.channel.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take,
    select: { id: true, slug: true, name: true, logoPath: true, _count: publishedVideoCount },
  });
  return rows.map((c) => ({ ...toChannelRef(c), videoCount: c._count.videos }));
}

export const getChannelBySlug = cache(async (slug: string) => {
  const c = await prisma.channel.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      logoPath: true,
      _count: { select: { videos: { where: PUBLISHED }, follows: true } },
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    logo: channelLogoUrl(c),
    videoCount: c._count.videos,
    followerCount: c._count.follows,
  };
});

// ---------- Series ----------

const hasPublishedEpisode = { videos: { some: PUBLISHED } } as const;

export async function listSeries(page: number): Promise<{ items: SeriesTile[]; info: PageInfo }> {
  const total = await prisma.series.count({ where: hasPublishedEpisode });
  const info = paginate(total, page, PAGE_SIZE);
  const rows = total
    ? await prisma.series.findMany({
        where: hasPublishedEpisode,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: info.skip,
        take: info.take,
        select: {
          id: true,
          slug: true,
          title: true,
          posterPath: true,
          channel: { select: { name: true } },
          _count: publishedVideoCount,
        },
      })
    : [];
  return {
    items: rows.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      poster: seriesPosterUrl(s),
      episodeCount: s._count.videos,
      channelName: s.channel?.name ?? null,
    })),
    info,
  };
}

export const getSeriesBySlug = cache(async (slug: string) => {
  const s = await prisma.series.findFirst({
    where: { slug, ...hasPublishedEpisode },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      posterPath: true,
      channel: { select: { id: true, slug: true, name: true, logoPath: true } },
    },
  });
  if (!s) return null;
  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    description: s.description,
    poster: seriesPosterUrl(s),
    channel: s.channel ? toChannelRef(s.channel) : null,
  };
});

// ---------- Models ----------

export async function listModels(page: number): Promise<{ items: ModelTile[]; info: PageInfo }> {
  const total = await prisma.model.count();
  const info = paginate(total, page, PAGE_SIZE);
  const rows = total
    ? await prisma.model.findMany({
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: info.skip,
        take: info.take,
        select: { id: true, slug: true, name: true, photoPath: true, _count: publishedModelVideoCount },
      })
    : [];
  return {
    items: rows.map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      photo: modelPhotoUrl(m),
      videoCount: m._count.videos,
    })),
    info,
  };
}

/** A handful of models to suggest on search / empty states (most followed first). */
export async function listSuggestedModels(take = 8): Promise<ModelTile[]> {
  const rows = await prisma.model.findMany({
    orderBy: [{ follows: { _count: "desc" } }, { name: "asc" }],
    take,
    select: { id: true, slug: true, name: true, photoPath: true, _count: publishedModelVideoCount },
  });
  return rows.map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    photo: modelPhotoUrl(m),
    videoCount: m._count.videos,
  }));
}

export const getModelBySlug = cache(async (slug: string) => {
  const m = await prisma.model.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      bio: true,
      photoPath: true,
      _count: { select: { videos: { where: { video: PUBLISHED } }, follows: true } },
    },
  });
  if (!m) return null;
  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    bio: m.bio,
    photo: modelPhotoUrl(m),
    videoCount: m._count.videos,
    followerCount: m._count.follows,
  };
});
