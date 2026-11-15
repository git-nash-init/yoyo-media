import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { formatINR } from "@/lib/format";
import { PAGE_SIZE, buildQuery, firstParam, pageCount, parsePage } from "@/lib/admin/logic";
import { dateWhere, isRangeActive, parseDateRange, rangeParams } from "@/lib/admin/dateRange";
import { DateEmptyState, DateFilterBar, clearDateHref } from "@/components/admin/DateFilter";
import { EmptyState } from "@/components/states";
import { FilterBar, FilterInput, FilterSelect, PageHeader, Pagination, PaymentStatusBadge, StatCard, Table, Td, Th, fmtDateTime } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Payments" };

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const statusRaw = firstParam(sp.status);
  const status = statusRaw === "PAID" || statusRaw === "PENDING" || statusRaw === "FAILED" ? statusRaw : "";
  const page = parsePage(sp.page);
  const range = parseDateRange(sp);
  const ranged = isRangeActive(range);
  const rp = rangeParams(range);
  const created: Prisma.PaymentWhereInput = dateWhere("createdAt", range);

  const where: Prisma.PaymentWhereInput = {
    ...created,
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ providerRef: { contains: q } }, { user: { email: { contains: q } } }, { user: { name: { contains: q } } }] } : {}),
  };

  const [byStatus, total, payments] = await Promise.all([
    prisma.payment.groupBy({ by: ["status"], where: created, _sum: { amountPaise: true }, _count: true }),
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        provider: true,
        providerRef: true,
        amountPaise: true,
        status: true,
        createdAt: true,
        paidAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);
  const stat = (s: "PAID" | "PENDING" | "FAILED") => {
    const row = byStatus.find((r) => r.status === s);
    return { sum: row?._sum.amountPaise ?? 0, count: row?._count ?? 0 };
  };
  const paid = stat("PAID");
  const pending = stat("PENDING");
  const failed = stat("FAILED");
  const filtered = Boolean(q || status);

  return (
    <>
      <PageHeader title="Payments" description="Every checkout attempt. Only paid payments count towards revenue." />

      <DateFilterBar range={range} caption="Filtered by checkout date (when the payment was created)" />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Revenue (paid)" value={formatINR(paid.sum)} hint={`${paid.count} payments`} />
        <StatCard label="Average payment" value={formatINR(paid.count ? Math.round(paid.sum / paid.count) : 0)} />
        <StatCard label="Pending" value={pending.count.toLocaleString("en-IN")} hint={formatINR(pending.sum)} />
        <StatCard label="Failed" value={failed.count.toLocaleString("en-IN")} hint={formatINR(failed.sum)} />
      </div>

      <FilterBar action="/admin/payments" clearHref={filtered ? `/admin/payments${buildQuery(rp)}` : undefined} keep={rp}>
        <FilterInput label="Search user or reference" name="q" type="search" defaultValue={q} placeholder="Email, name or reference…" maxLength={100} />
        <FilterSelect label="Status" name="status" defaultValue={status}>
          <option value="">All</option>
          <option value="PAID">Paid</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
        </FilterSelect>
      </FilterBar>

      {payments.length === 0 ? (
        ranged ? (
          <DateEmptyState noun="payments" range={range} alsoFiltered={filtered} clearHref={clearDateHref("/admin/payments", { q, status })} />
        ) : filtered ? (
          <EmptyState icon="🔎" title="No payments match these filters" reason="Nothing fits the search text and status you picked. Clear the filters to see all payments." actionHref="/admin/payments" actionLabel="Clear filters" />
        ) : (
          <EmptyState icon="💳" title="No payments yet" reason="Nobody has checked out so far. Payments appear here the moment a user starts a checkout." actionHref="/admin/settings" actionLabel="Review plan price" />
        )
      ) : (
        <>
          <Table label="Payments">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>User</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Provider</Th>
                <Th>Reference</Th>
                <Th>Paid at</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2/40">
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(p.createdAt)}</Td>
                  <Td>
                    <Link href={`/admin/subscribers/${p.user.id}`} className="block max-w-[14rem] hover:underline">
                      <span className="block truncate font-medium text-fg">{p.user.name}</span>
                      <span className="block truncate text-xs text-muted">{p.user.email}</span>
                    </Link>
                  </Td>
                  <Td className="text-right tabular-nums">{formatINR(p.amountPaise)}</Td>
                  <Td>
                    <PaymentStatusBadge status={p.status} />
                  </Td>
                  <Td className="text-muted">{p.provider}</Td>
                  <Td className="max-w-[12rem] truncate font-mono text-xs text-muted">{p.providerRef}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(p.paidAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pages={pageCount(total)} total={total} basePath="/admin/payments" params={{ q, status, ...rp }} />
        </>
      )}
    </>
  );
}
