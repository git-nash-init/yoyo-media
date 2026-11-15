import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { formatINR } from "@/lib/format";
import { PAGE_SIZE, buildQuery, firstParam, pageCount, parsePage, subscriptionState } from "@/lib/admin/logic";
import { dateWhere, isRangeActive, parseDateRange, rangeParams } from "@/lib/admin/dateRange";
import { DateEmptyState, DateFilterBar, clearDateHref } from "@/components/admin/DateFilter";
import { Badge, ButtonLink } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { FilterBar, FilterInput, FilterSelect, PageHeader, Pagination, StatCard, SubStateBadge, Table, Td, Th, fmtDate } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Subscribers" };

export default async function AdminSubscribersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const filterRaw = firstParam(sp.filter);
  const filter = filterRaw === "active" || filterRaw === "expired" || filterRaw === "never" ? filterRaw : "";
  const page = parsePage(sp.page);
  const now = new Date();
  const range = parseDateRange(sp, now);
  const ranged = isRangeActive(range);
  const rp = rangeParams(range);
  // Sign-up date filter; applies to the list and to every summary count.
  const joined: Prisma.UserWhereInput = dateWhere("createdAt", range);

  const activeSub: Prisma.SubscriptionWhereInput = { status: "ACTIVE", expiresAt: { gt: now } };
  const where: Prisma.UserWhereInput = {
    ...joined,
    ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
    ...(filter === "active" ? { subscriptions: { some: activeSub } } : {}),
    ...(filter === "expired" ? { AND: [{ subscriptions: { some: {} } }, { subscriptions: { none: activeSub } }] } : {}),
    ...(filter === "never" ? { subscriptions: { none: {} } } : {}),
  };

  const [totalUsers, activeAll, activePaid, total, users] = await Promise.all([
    prisma.user.count({ where: joined }),
    prisma.user.count({ where: { ...joined, subscriptions: { some: activeSub } } }),
    prisma.user.count({ where: { ...joined, subscriptions: { some: { ...activeSub, paymentId: { not: null } } } } }),
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        subscriptions: { select: { status: true, expiresAt: true } },
      },
    }),
  ]);

  const paid = users.length
    ? await prisma.payment.groupBy({
        by: ["userId"],
        where: { status: "PAID", userId: { in: users.map((u) => u.id) } },
        _sum: { amountPaise: true },
      })
    : [];
  const paidByUser = new Map(paid.map((p) => [p.userId, p._sum.amountPaise ?? 0]));
  const filtered = Boolean(q || filter);

  return (
    <>
      <PageHeader title="Subscribers" description="Everyone with an account, their plan status and what they have paid." />

      <DateFilterBar range={range} caption={ranged ? "Filtered by sign-up date. Plan status is as of now." : "Filtered by sign-up date"} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={ranged ? "Users joined" : "Total users"} value={totalUsers.toLocaleString("en-IN")} />
        <StatCard label="Active paid subscribers" value={activePaid.toLocaleString("en-IN")} hint="Active plan bought through checkout" />
        <StatCard label="Active (all)" value={activeAll.toLocaleString("en-IN")} hint={`${(activeAll - activePaid).toLocaleString("en-IN")} granted manually`} />
        <StatCard label="Without active plan" value={(totalUsers - activeAll).toLocaleString("en-IN")} />
      </div>

      <FilterBar action="/admin/subscribers" clearHref={filtered ? `/admin/subscribers${buildQuery(rp)}` : undefined} keep={rp}>
        <FilterInput label="Search name or email" name="q" type="search" defaultValue={q} placeholder="Search users…" maxLength={100} />
        <FilterSelect label="Plan status" name="filter" defaultValue={filter}>
          <option value="">Everyone</option>
          <option value="active">Active subscribers</option>
          <option value="expired">Expired</option>
          <option value="never">Never subscribed</option>
        </FilterSelect>
      </FilterBar>

      {users.length === 0 ? (
        ranged ? (
          <DateEmptyState noun="sign-ups" range={range} alsoFiltered={filtered} clearHref={clearDateHref("/admin/subscribers", { q, filter })} />
        ) : filtered ? (
          <EmptyState icon="🔎" title="No users match these filters" reason="Nobody fits the search text and plan status you picked. Clear the filters to see everyone." actionHref="/admin/subscribers" actionLabel="Clear filters" />
        ) : (
          <EmptyState icon="👥" title="No users yet" reason="Nobody has created an account so far. Users appear here as soon as they register." actionHref="/admin" actionLabel="Back to dashboard" />
        )
      ) : (
        <>
          <Table label="Users">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Joined</Th>
                <Th>Plan status</Th>
                <Th>Expiry</Th>
                <Th className="text-right">Total paid</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const st = subscriptionState(u.subscriptions, now);
                return (
                  <tr key={u.id} className="hover:bg-surface-2/40">
                    <Td>
                      <Link href={`/admin/subscribers/${u.id}`} className="flex items-center gap-2 font-medium text-fg hover:underline">
                        <span className="max-w-[12rem] truncate">{u.name}</span>
                        {u.role === "ADMIN" ? <Badge tone="brand">Admin</Badge> : null}
                      </Link>
                    </Td>
                    <Td className="max-w-[16rem] truncate text-muted">{u.email}</Td>
                    <Td className="whitespace-nowrap text-muted">{fmtDate(u.createdAt)}</Td>
                    <Td>
                      <SubStateBadge state={st.state} />
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{fmtDate(st.expiresAt)}</Td>
                    <Td className="text-right tabular-nums">{formatINR(paidByUser.get(u.id) ?? 0)}</Td>
                    <Td className="text-right">
                      <ButtonLink href={`/admin/subscribers/${u.id}`} variant="secondary" size="sm">
                        Manage
                      </ButtonLink>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} pages={pageCount(total)} total={total} basePath="/admin/subscribers" params={{ q, filter, ...rp }} />
        </>
      )}
    </>
  );
}
