import { Skeleton } from "@/components/ui";

export default function AccountLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8" aria-busy="true" aria-label="Loading your account">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
