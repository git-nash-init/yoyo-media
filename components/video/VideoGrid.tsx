import Link from "next/link";
import type { ReactNode } from "react";
import type { ModelTile, SeriesTile, VideoCardData } from "@/lib/queries/types";
import { VideoCard } from "./VideoCard";

export { VideoRow } from "./VideoRow";

/** Same column rhythm as VideoGridSkeleton so loading → loaded does not shift layout. */
export function VideoGrid({ videos, showChannel = true }: { videos: VideoCardData[]; showChannel?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map((v, i) => (
        <VideoCard key={v.id} video={v} showChannel={showChannel} eager={i < 4} />
      ))}
    </div>
  );
}

/** Horizontally scrollable row of cards (Continue watching, suggestions). */
export function VideoRail({ videos }: { videos: VideoCardData[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {videos.map((v) => (
        <div key={v.id} className="w-[78%] shrink-0 snap-start sm:w-72">
          <VideoCard video={v} />
        </div>
      ))}
    </div>
  );
}

const tileGrid = "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";

export function SeriesGrid({ series }: { series: SeriesTile[] }) {
  return (
    <div className={tileGrid}>
      {series.map((s) => (
        <Link key={s.id} href={`/series/${s.slug}`} className="group block min-w-0">
          <span className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line/60 transition group-hover:ring-brand/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.poster}
              alt=""
              width={300}
              height={400}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-300"
            />
            <span className="absolute bottom-2 left-2 rounded-md bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
              {s.episodeCount} {s.episodeCount === 1 ? "episode" : "episodes"}
            </span>
          </span>
          <span className="mt-2 block truncate text-sm font-medium text-fg group-hover:text-accent">{s.title}</span>
          {s.channelName ? <span className="block truncate text-xs text-muted">{s.channelName}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export function ModelGrid({ models }: { models: ModelTile[] }) {
  return (
    <div className={tileGrid}>
      {models.map((m) => (
        <Link key={m.id} href={`/models/${m.slug}`} className="group block min-w-0 text-center">
          <span className="mx-auto block aspect-square w-full overflow-hidden rounded-full bg-surface-2 ring-2 ring-line transition group-hover:ring-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.photo}
              alt=""
              width={240}
              height={240}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-300"
            />
          </span>
          <span className="mt-3 block truncate text-sm font-medium text-fg group-hover:text-accent">{m.name}</span>
          <span className="block text-xs text-muted">
            {m.videoCount} {m.videoCount === 1 ? "video" : "videos"}
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Section heading with an optional "see all" link. */
export function SectionHeading({ title, href, hrefLabel, children }: { title: string; href?: string; hrefLabel?: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="text-lg font-medium text-fg sm:text-xl">{title}</h2>
      {href && hrefLabel ? (
        <Link href={href} className="shrink-0 text-sm font-medium text-accent hover:underline">
          {hrefLabel}
        </Link>
      ) : (
        children
      )}
    </div>
  );
}
