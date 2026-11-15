import type { Metadata } from "next";
import { ButtonLink, Card } from "@/components/ui";
import { ErrorState } from "@/components/states";
import { prisma } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { getPlan } from "@/lib/settings";
import { requireUser, safeNext } from "@/lib/auth/guards";
import { CheckoutPanel } from "./CheckoutPanel";

export const metadata: Metadata = { title: "Checkout" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(d);

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next), "/browse");
  const user = await requireUser(`/checkout?next=${encodeURIComponent(next)}`);
  const plan = await getPlan();
  const retryHref = `/checkout?next=${encodeURIComponent(next)}`;

  // Failure handling: the attempt's real state is read from the database, scoped to this user.
  const attemptId = first(sp.attempt);
  if (attemptId && attemptId.length <= 64) {
    const attempt = await prisma.payment.findFirst({
      where: { id: attemptId, userId: user.id },
      select: { status: true },
    });
    if (attempt?.status === "FAILED") {
      return (
        <div className="mx-auto w-full max-w-2xl px-4 py-8">
          <ErrorState
            title="Payment did not go through"
            what="This test payment was declined, so your plan was not started."
            fault="network"
            fix="You were not charged. Try the payment again, or come back in a few minutes."
            action={<ButtonLink href={retryHref}>Try again</ButtonLink>}
          />
        </div>
      );
    }
    if (attempt?.status === "PENDING") {
      return (
        <div className="mx-auto w-full max-w-2xl px-4 py-8">
          <ErrorState
            title="We could not confirm your payment"
            what="The payment provider did not confirm this payment in time, so your plan was not started."
            fault="ours"
            fix="You were not charged. Please try again in a moment."
            action={<ButtonLink href={retryHref}>Try again</ButtonLink>}
          />
        </div>
      );
    }
  }

  const price = formatINR(plan.pricePaise);
  const renewing = !!user.subscriptionExpiresAt;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl text-fg">Checkout</h1>
        <p className="mt-1 text-sm text-muted">Review your order, then complete the payment.</p>
      </div>

      <Card className="p-5 sm:p-6">
        <h2 className="text-sm font-medium text-muted">Order summary</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-fg">
              YoYo Videos membership
              <span className="block text-muted">{plan.days} days of full access</span>
            </dt>
            <dd className="font-medium text-fg">{price}</dd>
          </div>
          <div className="flex justify-between gap-4 text-muted">
            <dt>Account</dt>
            <dd className="truncate">{user.email}</dd>
          </div>
          {renewing && user.subscriptionExpiresAt ? (
            <div className="flex justify-between gap-4 text-muted">
              <dt>Current plan ends</dt>
              <dd>{fmtDate(user.subscriptionExpiresAt)} (new days are added after this)</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-line pt-3 text-base font-medium text-fg">
            <dt>Total</dt>
            <dd>{price}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">One-time payment. It does not renew automatically.</p>
      </Card>

      <CheckoutPanel priceLabel={price} next={next} />
    </div>
  );
}
