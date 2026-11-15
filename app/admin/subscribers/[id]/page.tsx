import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { formatINR } from "@/lib/format";
import { getPlan } from "@/lib/settings";
import { idSchema, subscriptionState } from "@/lib/admin/logic";
import { isRangeActive, parseDateRange } from "@/lib/admin/dateRange";
import { DateEmptyLine, DateFilterBar } from "@/components/admin/DateFilter";
import { Badge, Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { PageHeader, PaymentStatusBadge, SectionTitle, StatCard, SubStateBadge, Table, Td, Th, fmtDate, fmtDateTime } from "@/components/admin/ui";
import { GrantForm, RevokeButton } from "@/components/admin/GrantForm";

export const metadata: Metadata = { title: "User" };

export default async function AdminSubscriberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id } = await params;
  const now = new Date();
  const range = parseDateRange(await searchParams, now);
  const ranged = isRangeActive(range);
  const inRange = (d: Date) => !range.start || !range.end || (d >= range.start && d < range.end);

  const user = idSchema.safeParse(id).success
    ? await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          mfaEnabled: true,
          createdAt: true,
          subscriptions: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, startsAt: true, expiresAt: true, note: true, paymentId: true, createdAt: true } },
          payments: { orderBy: { createdAt: "desc" }, select: { id: true, provider: true, providerRef: true, amountPaise: true, currency: true, status: true, createdAt: true, paidAt: true } },
        },
      })
    : null;

  if (!user) {
    return <EmptyState icon="🔎" title="User not found" reason="This account does not exist. It may have been deleted, or the link is wrong." actionHref="/admin/subscribers" actionLabel="Back to subscribers" />;
  }

  const [plan, commentCount, deletedComments] = await Promise.all([
    getPlan(),
    prisma.comment.count({ where: { userId: user.id } }),
    prisma.comment.count({ where: { userId: user.id, deletedAt: { not: null } } }),
  ]);
  // Plan status always uses every subscription (point in time); the history tables follow the date filter.
  const st = subscriptionState(user.subscriptions, now);
  const subscriptions = user.subscriptions.filter((s) => inRange(s.createdAt));
  const payments = user.payments.filter((p) => inRange(p.createdAt));
  const totalPaid = payments.filter((p) => p.status === "PAID").reduce((a, p) => a + p.amountPaise, 0);
  const selfHref = `/admin/subscribers/${user.id}`;

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/subscribers" className="text-muted hover:text-fg">
          ← Back to subscribers
        </Link>
      </p>
      <PageHeader
        title={user.name}
        description={`${user.email} · joined ${fmtDate(user.createdAt)}`}
        actions={
          <>
            {user.role === "ADMIN" ? <Badge tone="brand">Admin</Badge> : null}
            <SubStateBadge state={st.state} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Plan status" value={st.state === "active" ? "Active" : st.state === "expired" ? "Expired" : "None"} />
        <StatCard label={st.state === "active" ? "Access until" : "Last expiry"} value={<span className="text-lg">{fmtDate(st.expiresAt)}</span>} />
        <StatCard label={ranged ? "Paid in range" : "Total paid"} value={formatINR(totalPaid)} hint={ranged ? "Payments created in the date range" : undefined} />
        <StatCard
          label="Comments"
          value={commentCount.toLocaleString("en-IN")}
          hint={commentCount ? `${deletedComments} deleted · view all` : "None written"}
          href={commentCount ? `/admin/comments?user=${user.id}` : undefined}
        />
        <StatCard label="Two-step sign-in" value={<span className="text-lg">{user.mfaEnabled ? "Enabled" : "Off"}</span>} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Grant access manually</SectionTitle>
          <p className="mb-4 text-sm text-muted">
            Gives this user a subscription without a payment. If they already have time left, the days are added on top.
          </p>
          <GrantForm userId={user.id} defaultDays={plan.days} />
        </Card>
        <Card className="p-5">
          <SectionTitle>Revoke access</SectionTitle>
          {st.state === "active" ? (
            <>
              <p className="mb-4 text-sm text-muted">Cancels every active subscription for this user right now. They will see the paywall on their next page load.</p>
              <RevokeButton userId={user.id} name={user.name} />
            </>
          ) : (
            <p className="text-sm text-muted">This user has no active subscription, so there is nothing to revoke.</p>
          )}
          {user.role === "ADMIN" ? <p className="mt-3 text-sm text-muted">Note: admins can always watch, with or without a subscription.</p> : null}
        </Card>
      </div>

      <section className="mt-8">
        <DateFilterBar range={range} caption="History filtered by the date each subscription and payment was created" />
        <SectionTitle>Subscription history</SectionTitle>
        {subscriptions.length === 0 && ranged ? (
          <Card className="p-5">
            <DateEmptyLine noun="subscriptions" range={range} clearHref={selfHref} />
          </Card>
        ) : subscriptions.length === 0 ? (
          <Card className="p-5 text-sm text-muted">No subscriptions yet. One is created when this user pays, or when you grant access above.</Card>
        ) : (
          <Table label="Subscription history">
            <thead>
              <tr>
                <Th>Status</Th>
                <Th>Starts</Th>
                <Th>Expires</Th>
                <Th>Source</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s) => {
                const live = s.status === "ACTIVE" && s.expiresAt > now;
                return (
                  <tr key={s.id}>
                    <Td>{live ? <Badge tone="success">Active</Badge> : s.status === "CANCELLED" ? <Badge tone="danger">Cancelled</Badge> : <Badge>Expired</Badge>}</Td>
                    <Td className="whitespace-nowrap text-muted">{fmtDate(s.startsAt)}</Td>
                    <Td className="whitespace-nowrap text-muted">{fmtDate(s.expiresAt)}</Td>
                    <Td className="text-muted">{s.paymentId ? "Payment" : "Manual grant"}</Td>
                    <Td className="max-w-[22rem] text-muted">{s.note ?? "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      <section className="mt-8">
        <SectionTitle>Payment history</SectionTitle>
        {payments.length === 0 && ranged ? (
          <Card className="p-5">
            <DateEmptyLine noun="payments" range={range} clearHref={selfHref} />
          </Card>
        ) : payments.length === 0 ? (
          <Card className="p-5 text-sm text-muted">No payments yet. Payments appear here when this user goes through checkout.</Card>
        ) : (
          <Table label="Payment history">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Provider</Th>
                <Th>Reference</Th>
                <Th>Paid at</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(p.createdAt)}</Td>
                  <Td className="text-right tabular-nums">{formatINR(p.amountPaise)}</Td>
                  <Td>
                    <PaymentStatusBadge status={p.status} />
                  </Td>
                  <Td className="text-muted">{p.provider}</Td>
                  <Td className="max-w-[14rem] truncate font-mono text-xs text-muted">{p.providerRef}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(p.paidAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
