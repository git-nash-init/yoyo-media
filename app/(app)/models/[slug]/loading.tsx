import { VideoGridSkeleton } from "@/components/states";
import { Skeleton } from "@/components/ui";

export default function ModelDetailLoading() {
  return (
    <div role="status" aria-label="Loading model">
      <div className="border-b border-line">
        <div className="mx-auto flex max-w-[1600px] flex-col items-center gap-6 px-4 py-10 md:flex-row md:items-end md:gap-10 md:py-14 lg:px-6">
          <Skeleton className="h-44 w-44 shrink-0 !rounded-full sm:h-56 sm:w-56 lg:h-64 lg:w-64" />
          <div className="flex w-full flex-1 flex-col items-center gap-4 md:items-start">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-12 w-72 max-w-full" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="h-12 w-40 !rounded-full" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 pt-8 lg:px-6">
        <Skeleton className="h-7 w-48" />
        <VideoGridSkeleton count={8} />
      </div>
    </div>
  );
}
