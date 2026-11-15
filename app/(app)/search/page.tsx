import type { Metadata } from "next";
import Link from "next/link";
import { ChannelChips } from "@/components/video/ChannelChips";
import { ModelGrid, SectionHeading, SeriesGrid, VideoGrid } from "@/components/video/VideoGrid";
import { ErrorState } from "@/components/states";
import { ButtonLink } from "@/components/ui";
import { listChannels, listSuggestedModels } from "@/lib/queries/catalog";
import { cleanQuery, searchAll, suggestCorrection } from "@/lib/queries/search";
import { listPopularVideos } from "@/lib/queries/videos";
import { clientIp } from "@/lib/security/ip";
import { rateLimit } from "@/lib/security/ratelimit";

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = cleanQuery((await searchParams).q);
  return { title: q ? `Search: ${q}` : "Search", robots: { index: false } };
}

/** Shown under an empty query and under "no results": there is always somewhere to go next. */
async function Suggestions({ heading }: { heading: string }) {
  const [channels, models, popular] = await Promise.all([listChannels(24), listSuggestedModels(6), listPopularVideos(8)]);
  const nothing = channels.length === 0 && models.length === 0 && popular.length === 0;
  if (nothing) {
    return (
      <p className="text-sm text-muted">
        Our library is just getting started. New videos are added by our team —{" "}
        <Link href="/browse" className="font-medium text-accent hover:underline">
          check the home page
        </Link>{" "}
        soon.
      </p>
    );
  }
  return (
    <div className="space-y-10">
      <h2 className="sr-only">{heading}</h2>
      {channels.length > 0 ? (
        <section>
          <SectionHeading title="Browse channels" />
          <ChannelChips channels={channels} activeSlug="" />
        </section>
      ) : null}
      {models.length > 0 ? (
        <section>
          <SectionHeading title="Suggested models" href="/models" hrefLabel="All models" />
          <ModelGrid models={models} />
        </section>
      ) : null}
      {popular.length > 0 ? (
        <section>
          <SectionHeading title="Popular right now" href="/browse" hrefLabel="All videos" />
          <VideoGrid videos={popular} />
        </section>
      ) : null}
    </div>
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const q = cleanQuery((await searchParams).q);
  const wrap = "mx-auto max-w-[1600px] space-y-8 px-4 py-6 lg:px-6";

  if (!q) {
    return (
      <div className={wrap}>
        <header>
          <h1 className="font-display text-3xl text-fg sm:text-4xl">Search</h1>
          <p className="mt-1 text-sm text-muted">
            Type a title, series, model or channel in the search box above — or start with one of these.
          </p>
        </header>
        <Suggestions heading="Suggestions" />
      </div>
    );
  }

  const rl = await rateLimit(`search:${await clientIp()}`, 30, 60);
  if (!rl.ok) {
    return (
      <div className={wrap}>
        <ErrorState
          title="Too many searches"
          what="You have searched a lot in the last minute, so we paused search briefly."
          fault="yours"
          fix={`Wait about ${rl.retryAfterSec} seconds and search again.`}
          action={<ButtonLink href={`/search?q=${encodeURIComponent(q)}`}>Try again</ButtonLink>}
        />
      </div>
    );
  }

  const results = await searchAll(q);

  if (results.total === 0) {
    const correction = await suggestCorrection(q);
    return (
      <div className={wrap}>
        <header className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h1 className="font-display text-2xl text-fg sm:text-3xl">
            No results for <span className="break-words text-accent">“{q}”</span>
          </h1>
          {correction ? (
            <p className="mt-3 text-base text-fg">
              Did you mean{" "}
              <Link href={`/search?q=${encodeURIComponent(correction)}`} className="font-medium text-accent underline underline-offset-4">
                {correction}
              </Link>
              ?
            </p>
          ) : null}
          <p className="mt-3 text-sm text-muted">
            Check the spelling or try a shorter, more general word. You can also pick up from the suggestions below.
          </p>
        </header>
        <Suggestions heading="Suggestions" />
      </div>
    );
  }

  return (
    <div className={wrap}>
      <header>
        <h1 className="font-display text-3xl text-fg sm:text-4xl">
          Results for <span className="break-words text-accent">“{q}”</span>
        </h1>
        <p className="mt-1 text-sm text-muted" role="status">
          {results.total} {results.total === 1 ? "match" : "matches"}
        </p>
      </header>

      {results.channels.length > 0 ? (
        <section>
          <SectionHeading title="Channels" />
          <ChannelChips channels={results.channels} activeSlug="" />
        </section>
      ) : null}
      {results.models.length > 0 ? (
        <section>
          <SectionHeading title="Models" />
          <ModelGrid models={results.models} />
        </section>
      ) : null}
      {results.series.length > 0 ? (
        <section>
          <SectionHeading title="Series" />
          <SeriesGrid series={results.series} />
        </section>
      ) : null}
      {results.videos.length > 0 ? (
        <section>
          <SectionHeading title="Videos" />
          <VideoGrid videos={results.videos} />
        </section>
      ) : null}
    </div>
  );
}
