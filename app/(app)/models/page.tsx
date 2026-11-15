import type { Metadata } from "next";
import { Pagination } from "@/components/video/Pagination";
import { ModelGrid } from "@/components/video/VideoGrid";
import { EmptyState } from "@/components/states";
import { listModels } from "@/lib/queries/catalog";
import { parsePage } from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Models", description: "Meet the creators who appear in our originals." };

export default async function ModelsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const page = parsePage((await searchParams).page);
  const { items, info } = await listModels(page);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl text-fg sm:text-4xl">Models</h1>
        <p className="mt-1 text-sm text-muted">The faces of our originals. Follow your favourites to build your feed.</p>
      </header>

      {info.total === 0 ? (
        <EmptyState
          icon="⭐"
          title="No models yet"
          reason="Profiles are added by our team as new videos are published. Check back soon."
          actionHref="/browse"
          actionLabel="Browse videos"
        />
      ) : (
        <>
          <ModelGrid models={items} />
          <Pagination page={info.page} totalPages={info.totalPages} basePath="/models" />
        </>
      )}
    </div>
  );
}
