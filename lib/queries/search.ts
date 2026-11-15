import "server-only";
import { prisma } from "@/lib/db";
import { modelPhotoUrl, seriesPosterUrl } from "@/lib/media/urls";
import { didYouMean } from "./fuzzy";
import type { ChannelTile, ModelTile, SeriesTile, VideoCardData } from "./types";
import { PUBLISHED, cardSelect, toCard, toChannelRef } from "./videos";

export const MAX_QUERY_LENGTH = 80;

/** Trim, collapse whitespace and cap the length of an untrusted `?q=` value. */
export function cleanQuery(raw: string | string[] | undefined | null): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (v ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

export type SearchResults = {
  videos: VideoCardData[];
  series: SeriesTile[];
  models: ModelTile[];
  channels: ChannelTile[];
  total: number;
};

const publishedVideoCount = { select: { videos: { where: PUBLISHED } } } as const;

/** Grouped search. Prisma `contains` is parameterised and case-insensitive on MySQL's default collation. */
export async function searchAll(q: string, limits = { videos: 24, other: 12 }): Promise<SearchResults> {
  const [videos, series, models, channels] = await Promise.all([
    prisma.video.findMany({
      where: { ...PUBLISHED, OR: [{ title: { contains: q } }, { description: { contains: q } }] },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: limits.videos,
      select: cardSelect,
    }),
    prisma.series.findMany({
      where: {
        videos: { some: PUBLISHED },
        OR: [{ title: { contains: q } }, { description: { contains: q } }],
      },
      take: limits.other,
      select: {
        id: true,
        slug: true,
        title: true,
        posterPath: true,
        channel: { select: { name: true } },
        _count: publishedVideoCount,
      },
    }),
    prisma.model.findMany({
      where: { name: { contains: q } },
      orderBy: { name: "asc" },
      take: limits.other,
      select: {
        id: true,
        slug: true,
        name: true,
        photoPath: true,
        _count: { select: { videos: { where: { video: PUBLISHED } } } },
      },
    }),
    prisma.channel.findMany({
      where: { name: { contains: q } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: limits.other,
      select: { id: true, slug: true, name: true, logoPath: true, _count: publishedVideoCount },
    }),
  ]);
  return {
    videos: videos.map(toCard),
    series: series.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      poster: seriesPosterUrl(s),
      episodeCount: s._count.videos,
      channelName: s.channel?.name ?? null,
    })),
    models: models.map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      photo: modelPhotoUrl(m),
      videoCount: m._count.videos,
    })),
    channels: channels.map((c) => ({ ...toChannelRef(c), videoCount: c._count.videos })),
    total: videos.length + series.length + models.length + channels.length,
  };
}

/** Known titles and names the "Did you mean" helper may suggest (published content only). */
async function knownNames(): Promise<string[]> {
  const [videos, series, models, channels] = await Promise.all([
    prisma.video.findMany({
      where: PUBLISHED,
      orderBy: { publishedAt: "desc" },
      take: 1000,
      select: { title: true },
    }),
    prisma.series.findMany({ where: { videos: { some: PUBLISHED } }, take: 500, select: { title: true } }),
    prisma.model.findMany({ take: 500, select: { name: true } }),
    prisma.channel.findMany({ take: 200, select: { name: true } }),
  ]);
  // Names first so an exact-ish name wins ties over a long video title.
  return [
    ...channels.map((c) => c.name),
    ...models.map((m) => m.name),
    ...series.map((s) => s.title),
    ...videos.map((v) => v.title),
  ];
}

export async function suggestCorrection(q: string): Promise<string | null> {
  return didYouMean(q, await knownNames());
}

export type QuickSuggestion = { label: string; href: string; kind: "Video" | "Series" | "Model" | "Channel" };

/** Lightweight typeahead for the header search box. */
export async function quickSuggestions(q: string, take = 8): Promise<QuickSuggestion[]> {
  const r = await searchAll(q, { videos: 5, other: 3 });
  const out: QuickSuggestion[] = [
    ...r.channels.map((c) => ({ label: c.name, href: `/channel/${c.slug}`, kind: "Channel" as const })),
    ...r.models.map((m) => ({ label: m.name, href: `/models/${m.slug}`, kind: "Model" as const })),
    ...r.series.map((s) => ({ label: s.title, href: `/series/${s.slug}`, kind: "Series" as const })),
    ...r.videos.map((v) => ({ label: v.title, href: `/watch/${v.slug}`, kind: "Video" as const })),
  ];
  return out.slice(0, take);
}
