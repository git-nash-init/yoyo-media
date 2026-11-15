import type { Metadata } from "next";
import { Pagination } from "@/components/video/Pagination";
import { SeriesGrid } from "@/components/video/VideoGrid";
import { EmptyState } from "@/components/states";
import { listSeries } from "@/lib/queries/catalog";
import { parsePage } from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Series", description: "Original series, episode by episode." };

export default async function SeriesIndexPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const page = parsePage((await searchParams).page);
  const { items, info } = await listSeries(page);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl text-fg sm:text-4xl">Series</h1>
        <p className="mt-1 text-sm text-muted">Original series from our own creators, episode by episode.</p>
      </header>

      {info.total === 0 ? (
        <EmptyState
          title="No series yet"
          reason="Series appear here once their first episode is published. Check back soon."
          actionHref="/browse"
          actionLabel="Browse videos"
        />
      ) : (
        <>
          <SeriesGrid series={items} />
          <Pagination page={info.page} totalPages={info.totalPages} basePath="/series" />
        </>
      )}
    </div>
  );
}
