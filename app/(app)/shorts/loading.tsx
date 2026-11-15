import { Skeleton } from "@/components/ui";

/** One full-height 9:16 slide, like the shorts feed. */
export default function ShortsLoading() {
  return (
    <div
      className="flex h-[calc(100dvh_-_7rem_-_env(safe-area-inset-bottom))] items-center justify-center md:h-[calc(100dvh_-_3.5rem)] md:py-3"
      role="status"
      aria-label="Loading shorts"
    >
      <div className="relative aspect-[9/16] h-full max-w-full">
        <Skeleton className="h-full w-full !rounded-none md:!rounded-2xl" />
        <div className="absolute inset-x-4 bottom-5 space-y-2">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-9 w-9 !rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}
