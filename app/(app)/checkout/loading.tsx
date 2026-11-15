import { Skeleton } from "@/components/ui";

export default function CheckoutLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8" aria-busy="true" aria-label="Loading checkout">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-52 w-full" />
    </div>
  );
}
