import { Skeleton } from "@/components/ui";

export default function AuthLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-12 w-full !rounded-full" />
    </div>
  );
}
