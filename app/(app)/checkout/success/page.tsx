import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui";
import { ErrorState, SuccessState } from "@/components/states";
import { prisma } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { requireUser, safeNext } from "@/lib/auth/guards";
import { activeSubscription } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Payment confirmed" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(d);

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next), "/browse");
  const user = await requireUser("/checkout/success");

  // The truth comes from the database for the signed-in user, never from the URL.
  const [payment, subscription] = await Promise.all([
    prisma.payment.findFirst({
      where: { userId: user.id, status: "PAID" },
      orderBy: { paidAt: "desc" },
      select: { amountPaise: true, paidAt: true },
    }),
    activeSubscription(user.id),
  ]);

  if (!payment || !subscription) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <ErrorState
          title="No confirmed payment yet"
          what="We could not find a completed payment or an active plan on your account."
          fault="yours"
          fix="You have not been charged. Go to checkout to complete your payment."
          action={<ButtonLink href={`/checkout?next=${encodeURIComponent(next)}`}>Go to checkout</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <SuccessState
        title="Payment confirmed"
        message={`Your test payment of ${formatINR(payment.amountPaise)} went through and your membership is active.`}
        next={`You have full access until ${fmtDate(subscription.expiresAt)}. Everything is available, so you can start right away.`}
        actionHref={next}
        actionLabel="Start watching"
      />
    </div>
  );
}
