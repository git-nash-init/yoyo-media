import { Skeleton } from "@/components/ui";

/** Shaped like the watch page: player, title block, channel row, sidebar list. */
export default function WatchLoading() {
  return (
    <div className="mx-auto max-w-[1600px] sm:px-4 sm:py-5 lg:px-6" role="status" aria-label="Loading video">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Skeleton className="aspect-video w-full !rounded-none sm:!rounded-xl" />
          <div className="space-y-4 px-4 pt-4 sm:px-0">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-40" />
            <div className="flex items-center justify-between gap-4 border-y border-line py-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 !rounded-full" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-8 w-24 !rounded-full" />
              </div>
              <Skeleton className="h-10 w-32 !rounded-full" />
            </div>
            <Skeleton className="h-24 w-full !rounded-2xl" />
          </div>
        </div>
        <div className="space-y-3 px-4 sm:px-0">
          <Skeleton className="h-6 w-40" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="aspect-video w-36 shrink-0 sm:w-40" />
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
