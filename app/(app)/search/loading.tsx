import { VideoGridSkeleton } from "@/components/states";
import { Skeleton } from "@/components/ui";

export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6 space-y-8" role="status" aria-label="Loading">
      <Skeleton className="h-9 w-72 max-w-full" />
      <Skeleton className="h-7 w-44" />
      <VideoGridSkeleton count={12} />
    </div>
  );
}
