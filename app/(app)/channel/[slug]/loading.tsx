import { VideoGridSkeleton } from "@/components/states";
import { Skeleton } from "@/components/ui";

export default function ChannelLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6 space-y-8" role="status" aria-label="Loading">
      <div className="flex gap-2 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-28 shrink-0 !rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:p-6" aria-hidden="true">
        <Skeleton className="h-20 w-20 shrink-0 !rounded-full sm:h-28 sm:w-28" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <Skeleton className="h-12 w-32 !rounded-full" />
      </div>
      <Skeleton className="h-7 w-44" />
      <VideoGridSkeleton count={12} />
    </div>
  );
}
