import Link from "next/link";
import { ChevronLeft, ChevronRight } from "@/components/shell/icons";
import { pageHref, pageWindow } from "@/lib/queries/pagination";

const cell =
  "inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-3 text-sm font-medium tabular-nums transition-colors";

/**
 * Numbered pagination driven by `?page=`. Plain links, so it works without
 * JavaScript and every page is shareable. Renders nothing for a single page.
 */
export function Pagination({
  page,
  totalPages,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  /** Other query params to keep (e.g. `{ q }` on search). */
  params?: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;
  const href = (p: number) => pageHref(basePath, p, params);
  const items = pageWindow(page, totalPages);

  return (
    <nav aria-label="Pagination" className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={`${cell} btn btn-secondary`}>
          <ChevronLeft size={16} />
          <span className="ml-1 hidden sm:inline">Previous</span>
          <span className="sr-only sm:hidden">Previous page</span>
        </Link>
      ) : (
        <span aria-disabled="true" className={`${cell} border border-line text-muted opacity-40`}>
          <ChevronLeft size={16} />
          <span className="ml-1 hidden sm:inline">Previous</span>
        </span>
      )}

      {items.map((it, i) =>
        it === "gap" ? (
          <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted">
            …
          </span>
        ) : it === page ? (
          <span key={it} aria-current="page" className={`${cell} btn btn-primary`}>
            <span className="sr-only">Page </span>
            {it}
          </span>
        ) : (
          <Link key={it} href={href(it)} className={`${cell} btn btn-ghost`}>
            <span className="sr-only">Page </span>
            {it}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link href={href(page + 1)} rel="next" className={`${cell} btn btn-secondary`}>
          <span className="mr-1 hidden sm:inline">Next</span>
          <span className="sr-only sm:hidden">Next page</span>
          <ChevronRight size={16} />
        </Link>
      ) : (
        <span aria-disabled="true" className={`${cell} border border-line text-muted opacity-40`}>
          <span className="mr-1 hidden sm:inline">Next</span>
          <ChevronRight size={16} />
        </span>
      )}
    </nav>
  );
}
