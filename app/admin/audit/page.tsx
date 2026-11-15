import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { buildQuery, firstParam, pageCount, parsePage } from "@/lib/admin/logic";
import { dateWhere, isRangeActive, parseDateRange, rangeParams } from "@/lib/admin/dateRange";
import { DateEmptyState, DateFilterBar, clearDateHref } from "@/components/admin/DateFilter";
import { EmptyState } from "@/components/states";
import { FilterBar, FilterInput, PageHeader, Pagination, Table, Td, Th, fmtDateTime } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Audit log" };

const SIZE = 40;
const SENSITIVE = /pass(word)?|secret|token|cookie|authorization|totp|otp|hash/i;

/** Compact, safe one-line rendering of the meta JSON (sensitive-looking keys are hidden). */
function metaText(meta: unknown): string {
  if (meta == null) return "—";
  if (typeof meta !== "object" || Array.isArray(meta)) return String(JSON.stringify(meta)).slice(0, 200);
  const parts = Object.entries(meta as Record<string, unknown>).map(([k, v]) => {
    const value = SENSITIVE.test(k) ? "[hidden]" : typeof v === "string" ? v : JSON.stringify(v);
    return `${k}: ${value}`;
  });
  return parts.join(" · ").slice(0, 200) || "—";
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = firstParam(sp.q, 64);
  const page = parsePage(sp.page);

  const range = parseDateRange(sp);
  const ranged = isRangeActive(range);
  const rp = rangeParams(range);
  const where: Prisma.AuditLogWhereInput = {
    ...dateWhere("createdAt", range),
    ...(q ? { OR: [{ action: { contains: q } }, { target: { contains: q } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * SIZE,
      take: SIZE,
      select: { id: true, action: true, target: true, meta: true, createdAt: true, user: { select: { name: true, email: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader title="Audit log" description="A permanent record of admin changes and security events, newest first." />

      <DateFilterBar range={range} caption="Filtered by the time of the event" />

      <FilterBar action="/admin/audit" clearHref={q ? `/admin/audit${buildQuery(rp)}` : undefined} keep={rp}>
        <FilterInput label="Search action or target" name="q" type="search" defaultValue={q} placeholder="e.g. video.delete" maxLength={64} />
      </FilterBar>

      {rows.length === 0 ? (
        ranged ? (
          <DateEmptyState noun="audit entries" range={range} alsoFiltered={Boolean(q)} clearHref={clearDateHref("/admin/audit", { q })} />
        ) : q ? (
          <EmptyState icon="🔎" title="No entries match" reason="No audit entries contain that action or target. Clear the search to see everything." actionHref="/admin/audit" actionLabel="Clear search" />
        ) : (
          <EmptyState icon="📋" title="Nothing logged yet" reason="Entries appear here whenever an admin publishes, edits, deletes or changes settings." actionHref="/admin" actionLabel="Back to dashboard" />
        )
      ) : (
        <>
          <Table label="Audit log">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(r.createdAt)}</Td>
                  <Td className="max-w-[12rem] truncate" >{r.user ? r.user.name : <span className="text-muted">System</span>}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{r.action}</Td>
                  <Td className="max-w-[14rem] truncate font-mono text-xs text-muted">{r.target ?? "—"}</Td>
                  <Td className="max-w-[22rem] truncate text-xs text-muted">{metaText(r.meta)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pages={pageCount(total, SIZE)} total={total} basePath="/admin/audit" params={{ q, ...rp }} />
        </>
      )}
    </>
  );
}
