import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayIcon } from "@/components/shell/icons";
import { VideoGrid } from "@/components/video/VideoGrid";
import { ButtonLink } from "@/components/ui";
import { getSeriesBySlug } from "@/lib/queries/catalog";
import { listSeriesEpisodes } from "@/lib/queries/videos";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const series = await getSeriesBySlug((await params).slug);
  return series
    ? { title: series.title, description: series.description?.slice(0, 160) ?? `Watch ${series.title}.` }
    : { title: "Series not found" };
}

export default async function SeriesPage({ params }: Props) {
  const series = await getSeriesBySlug((await params).slug);
  if (!series) notFound();
  const episodes = await listSeriesEpisodes(series.id);
  if (episodes.length === 0) notFound();
  const first = episodes[0];

  return (
    <div className="mx-auto max-w-[1600px] space-y-10 px-4 py-6 lg:px-6">
      <header className="flex flex-col gap-6 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={series.poster}
          alt=""
          width={300}
          height={400}
          decoding="async"
          className="aspect-[3/4] w-40 shrink-0 self-start rounded-2xl bg-surface-2 object-cover ring-1 ring-line sm:w-56"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-accent">Series</p>
          <h1 className="mt-1 font-display text-4xl text-fg sm:text-5xl">{series.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>
              {episodes.length} {episodes.length === 1 ? "episode" : "episodes"}
            </span>
            {series.channel ? (
              <>
                <span aria-hidden="true">·</span>
                <Link href={`/channel/${series.channel.slug}`} className="inline-flex items-center gap-2 font-medium text-fg hover:text-accent">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={series.channel.logo}
                    alt=""
                    width={24}
                    height={24}
                    decoding="async"
                    className="h-6 w-6 rounded-full bg-surface-2 object-cover"
                  />
                  {series.channel.name}
                </Link>
              </>
            ) : null}
          </p>
          {series.description ? (
            <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-fg/90">{series.description}</p>
          ) : null}
          <ButtonLink href={`/watch/${first.slug}`} size="lg" className="mt-6">
            <PlayIcon size={18} />
            {first.episodeNo != null ? `Play episode ${first.episodeNo}` : "Play first episode"}
          </ButtonLink>
        </div>
      </header>

      <section aria-labelledby="episodes-heading">
        <h2 id="episodes-heading" className="mb-4 text-lg font-medium text-fg sm:text-xl">
          Episodes
        </h2>
        <VideoGrid videos={episodes} showChannel={false} />
      </section>
    </div>
  );
}
