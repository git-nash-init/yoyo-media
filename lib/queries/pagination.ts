// Pure pagination maths. No prisma / server-only imports so it can be unit-tested
// and used from both server and client components.

export const PAGE_SIZE = 24;
export const MAX_PAGE = 10_000;

/** Parse an untrusted `?page=` value into a safe 1-based page number. */
export function parsePage(raw: string | string[] | undefined | null): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !/^\d{1,6}$/.test(v)) return 1;
  const n = Number(v);
  return Math.min(Math.max(1, n), MAX_PAGE);
}

export type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  skip: number;
  take: number;
  hasPrev: boolean;
  hasNext: boolean;
};

/** Clamp the requested page into range and work out skip/take for the query. */
export function paginate(total: number, requestedPage: number, pageSize: number = PAGE_SIZE): PageInfo {
  const size = Math.max(1, Math.floor(pageSize));
  const safeTotal = Math.max(0, Math.floor(total));
  const totalPages = Math.max(1, Math.ceil(safeTotal / size));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages);
  return {
    page,
    pageSize: size,
    total: safeTotal,
    totalPages,
    skip: (page - 1) * size,
    take: size,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}

export type PageItem = number | "gap";

/**
 * Numbered page list with gaps, e.g. page 6 of 20 → [1, "gap", 5, 6, 7, "gap", 20].
 * Always includes the first and last page and `siblings` pages either side of the current one.
 */
export function pageWindow(page: number, totalPages: number, siblings = 1): PageItem[] {
  const last = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(Math.max(1, Math.floor(page) || 1), last);
  const wanted = new Set<number>([1, last]);
  for (let p = cur - siblings; p <= cur + siblings; p++) if (p >= 1 && p <= last) wanted.add(p);
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: PageItem[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev === 2) out.push(prev + 1); // a one-page gap is just that page
    else if (p - prev > 2) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

/** Build a link to another page, preserving other query params. Page 1 has no `page` param. */
export function pageHref(basePath: string, page: number, params: Record<string, string | undefined> = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
