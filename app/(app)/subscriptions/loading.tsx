import { VideoGridSkeleton } from "@/components/states";
import { Skeleton } from "@/components/ui";

export default function SubscriptionsLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6 space-y-8" role="status" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <div className="flex gap-4 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-16 shrink-0 !rounded-full" />
        ))}
      </div>
      <Skeleton className="h-7 w-44" />
      <VideoGridSkeleton count={12} />
    </div>
  );
}
