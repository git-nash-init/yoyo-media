import { VideoGridSkeleton } from "@/components/states";
import { Skeleton } from "@/components/ui";

export default function SeriesDetailLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6 space-y-10" role="status" aria-label="Loading series">
      <div className="flex flex-col gap-6 sm:flex-row">
        <Skeleton className="aspect-[3/4] w-40 shrink-0 !rounded-2xl sm:w-56" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-80 max-w-full" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-full max-w-2xl" />
          <Skeleton className="h-4 w-2/3 max-w-xl" />
          <Skeleton className="h-12 w-44 !rounded-full" />
        </div>
      </div>
      <Skeleton className="h-7 w-32" />
      <VideoGridSkeleton count={8} />
    </div>
  );
}
