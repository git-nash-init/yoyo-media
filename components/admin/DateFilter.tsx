import Link from "next/link";
import { Suspense } from "react";
import { buildQuery } from "@/lib/admin/logic";
import { type DateRange, rangePhrase, rangeState } from "@/lib/admin/dateRange";
import { Skeleton } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { DateRangeFilter, type FieldToggle } from "@/components/admin/DateRangeFilter";

// Server-side glue between a page's parsed DateRange and the client filter / empty states.

/** The date range filter row. Wrapped in Suspense because the client part reads useSearchParams. */
export function DateFilterBar({ range, caption, field }: { range: DateRange; caption: string; field?: FieldToggle }) {
  return (
    <Suspense fallback={<Skeleton className="mb-4 h-14 w-full" />}>
      <DateRangeFilter range={rangeState(range)} caption={caption} field={field} />
    </Suspense>
  );
}

/** Link that drops the date params but keeps every other filter. */
export function clearDateHref(basePath: string, params: Record<string, string | undefined> = {}): string {
  return `${basePath}${buildQuery(params)}`;
}

/** Empty state when the date filter is the reason nothing shows. */
export function DateEmptyState({ noun, range, clearHref, alsoFiltered = false }: { noun: string; range: DateRange; clearHref: string; alsoFiltered?: boolean }) {
  return (
    <EmptyState
      icon="📅"
      title={`No ${noun} ${rangePhrase(range)}`}
      reason={alsoFiltered ? "Nothing matches your filters in this date range. Try a wider date range or clear the other filters." : "Try a wider date range."}
      actionHref={clearHref}
      actionLabel="Clear date filter"
    />
  );
}

/** Small inline empty message for sections inside a page (cards and history tables). */
export function DateEmptyLine({ noun, range, clearHref }: { noun: string; range: DateRange; clearHref: string }) {
  return (
    <p className="text-sm text-muted">
      No {noun} {rangePhrase(range)}. Try a wider date range or{" "}
      <Link href={clearHref} className="font-medium text-accent hover:underline">
        clear the date filter
      </Link>
      .
    </p>
  );
}
