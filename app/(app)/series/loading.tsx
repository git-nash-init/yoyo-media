import { TileGridSkeleton } from "@/components/states";
import { Skeleton } from "@/components/ui";

export default function SeriesLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6" role="status" aria-label="Loading">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <TileGridSkeleton count={12} />
    </div>
  );
}
