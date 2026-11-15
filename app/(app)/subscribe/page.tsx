import type { Metadata } from "next";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { getPlan } from "@/lib/settings";
import { safeNext } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Subscribe" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(d);

const INCLUDED = [
  "Every original series, episode and short",
  "New drops as soon as they are published",
  "Watch on phone, tablet or computer",
  "Pick up where you left off on any device",
  "Follow your favourite channels and creators",
];

function Check() {
  return (
    <svg className="mt-0.5 shrink-0 text-success" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next), "/browse");
  const [user, plan] = await Promise.all([getCurrentUser(), getPlan()]);
  const price = formatINR(plan.pricePaise);
  const checkoutHref = `/checkout?next=${encodeURIComponent(next)}`;
  // After registering, come back here with the original destination intact.
  const subscribeHere = next === "/browse" ? "/subscribe" : `/subscribe?next=${encodeURIComponent(next)}`;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div className="text-center">
        <h1 className="font-display text-4xl text-fg">One plan, everything included</h1>
        <p className="mt-2 text-muted">Unlock every original on YoYo Videos for {plan.days} days.</p>
      </div>

      {user?.isSubscriber ? (
        <Card className="p-5 sm:p-6" role="status">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">Active</Badge>
            <h2 className="font-medium text-fg">You are already subscribed</h2>
          </div>
          <p className="mt-2 text-sm text-muted">
            {user.subscriptionExpiresAt
              ? `Your membership is active until ${fmtDate(user.subscriptionExpiresAt)}. There is nothing more to pay right now.`
              : "Your account has full access. There is nothing to pay."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href={next}>Go to browse</ButtonLink>
            {user.subscriptionExpiresAt ? (
              <ButtonLink href={checkoutHref} variant="secondary">
                Add {plan.days} more days
              </ButtonLink>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 p-5 sm:p-6">
          <p className="text-sm font-medium text-accent">YoYo Videos membership</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-medium text-fg">{price}</span>
            <span className="text-sm text-muted">for {plan.days} days</span>
          </p>
          <p className="mt-1 text-sm text-muted">One-time payment. No automatic renewal.</p>
        </div>
        <div className="p-5 sm:p-6">
          <h2 className="text-sm font-medium text-muted">What is included</h2>
          <ul className="mt-4 space-y-3 text-sm text-fg">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-3">
                <Check />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {!user ? (
            <div className="mt-6 space-y-3">
              <ButtonLink href={`/register?next=${encodeURIComponent(subscribeHere)}`} size="lg" className="w-full">
                Create account to subscribe
              </ButtonLink>
              <p className="text-center text-sm text-muted">
                Already have an account?{" "}
                <a href={`/login?next=${encodeURIComponent(subscribeHere)}`} className="font-medium text-accent hover:underline">
                  Sign in
                </a>
              </p>
            </div>
          ) : !user.isSubscriber ? (
            <ButtonLink href={checkoutHref} size="lg" className="mt-6 w-full">
              Subscribe for {price}
            </ButtonLink>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
