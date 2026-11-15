import { Skeleton } from "@/components/ui";

export default function SecurityLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8" aria-busy="true" aria-label="Loading security settings">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
