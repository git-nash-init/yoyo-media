import type { Metadata } from "next";
import { ChannelChips } from "@/components/video/ChannelChips";
import { Pagination } from "@/components/video/Pagination";
import { SectionHeading, VideoGrid, VideoRail } from "@/components/video/VideoGrid";
import { EmptyState } from "@/components/states";
import { getCurrentUser } from "@/lib/auth/session";
import { listChannels } from "@/lib/queries/catalog";
import { parsePage } from "@/lib/queries/pagination";
import { listContinueWatching, listLatestVideos } from "@/lib/queries/videos";

export const metadata: Metadata = { title: "Browse" };

export default async function BrowsePage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const page = parsePage((await searchParams).page);
  const user = await getCurrentUser();

  const [channels, latest, continueWatching] = await Promise.all([
    listChannels(),
    listLatestVideos(page),
    user && page === 1 ? listContinueWatching(user.id) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-5 lg:px-6">
      <h1 className="sr-only">Browse videos</h1>
      <ChannelChips channels={channels} />

      {continueWatching.length > 0 ? (
        <section aria-labelledby="continue-heading">
          <div className="mb-4">
            <h2 id="continue-heading" className="text-lg font-medium text-fg sm:text-xl">
              Continue watching
            </h2>
          </div>
          <VideoRail videos={continueWatching} />
        </section>
      ) : null}

      <section>
        {latest.info.total === 0 ? (
          <EmptyState
            title="Nothing here yet"
            reason="New videos are added by our team. Check back soon."
            actionHref="/"
            actionLabel="Back to home"
          />
        ) : (
          <>
            <SectionHeading title={latest.info.page > 1 ? `Latest videos · Page ${latest.info.page}` : "Latest videos"} />
            <VideoGrid videos={latest.items} />
            <Pagination page={latest.info.page} totalPages={latest.info.totalPages} basePath="/browse" />
          </>
        )}
      </section>
    </div>
  );
}
