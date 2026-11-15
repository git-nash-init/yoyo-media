import { Card, Skeleton } from "@/components/ui";

/** Dashboard-shaped skeleton: stat cards, storage bar, two charts, three lists. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Card key={i} className="space-y-3 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </Card>
        ))}
      </div>
      <Card className="mt-4 space-y-3 p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-full !rounded-full" />
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Card key={i} className="space-y-3 p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-36 w-full" />
          </Card>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="space-y-3 p-5">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 4 }, (_, j) => (
              <Skeleton key={j} className="h-10 w-full" />
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
