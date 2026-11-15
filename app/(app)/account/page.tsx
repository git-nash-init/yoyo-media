import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NameForm, PasswordForm, SessionButtons } from "@/components/auth/AccountForms";
import { prisma } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { requireUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Account" };

const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(d);

const STATUS_TONE = { PAID: "success", FAILED: "danger", PENDING: "warning" } as const;
const STATUS_LABEL = { PAID: "Paid", FAILED: "Failed", PENDING: "Not completed" } as const;

function daysUntil(date: Date | null): number {
  return date ? Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000)) : 0;
}

export default async function AccountPage() {
  const user = await requireUser("/account");
  const [payments, sessionCount] = await Promise.all([
    prisma.payment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, amountPaise: true, status: true, createdAt: true },
    }),
    prisma.session.count({ where: { userId: user.id, mfaPending: false, expiresAt: { gt: new Date() } } }),
  ]);
  const otherSessions = Math.max(0, sessionCount - 1);
  const daysLeft = daysUntil(user.subscriptionExpiresAt);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl text-fg">Account</h1>
        <p className="mt-1 text-sm text-muted">Signed in as {user.email}</p>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-fg">Plan</h2>
          {user.isSubscriber ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">No active plan</Badge>}
        </div>
        {user.subscriptionExpiresAt ? (
          <p className="mt-2 text-sm text-muted">
            Your membership is active until <span className="font-medium text-fg">{fmtDate(user.subscriptionExpiresAt)}</span>{" "}
            ({daysLeft} {daysLeft === 1 ? "day" : "days"} left). It does not renew automatically.
          </p>
        ) : user.isSubscriber ? (
          <p className="mt-2 text-sm text-muted">This account has full access as part of the team.</p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            You do not have an active membership, so videos are locked. Subscribe for full access.
          </p>
        )}
        <div className="mt-4">
          {user.subscriptionExpiresAt ? (
            <ButtonLink href="/checkout" variant="secondary">
              Extend membership
            </ButtonLink>
          ) : !user.isSubscriber ? (
            <ButtonLink href="/subscribe">See the plan</ButtonLink>
          ) : null}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-medium text-fg">Profile</h2>
        <div className="mt-4 max-w-md">
          <NameForm name={user.name} />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-medium text-fg">Appearance</h2>
        <p className="mt-1 text-sm text-muted">
          Choose light or dark, or follow your device setting. Saved on this browser.
        </p>
        <div className="mt-4">
          <ThemeToggle variant="segmented" />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-medium text-fg">Password</h2>
        <p className="mt-1 text-sm text-muted">Changing your password signs out every other device.</p>
        <div className="mt-4 max-w-md">
          <PasswordForm />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-fg">Two-step sign-in</h2>
          {user.mfaEnabled ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted">
          {user.mfaEnabled
            ? "A code from your authenticator app is required each time you sign in."
            : "Add a code from an authenticator app as a second step when you sign in."}
        </p>
        <Link href="/account/security" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
          Manage two-step sign-in
        </Link>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-medium text-fg">Devices</h2>
        <p className="mt-1 text-sm text-muted">
          {otherSessions === 0
            ? "You are only signed in on this device."
            : `You are signed in on this device and ${otherSessions} other ${otherSessions === 1 ? "device" : "devices"}.`}
        </p>
        <div className="mt-4">
          <SessionButtons otherSessions={otherSessions} />
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-medium text-fg">Payment history</h2>
        {payments.length === 0 ? (
          <EmptyState
            icon="🧾"
            title="No payments yet"
            reason="Payments appear here after you subscribe. You have not been charged for anything."
            actionHref="/subscribe"
            actionLabel="See the plan"
          />
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-fg">YoYo Videos membership</p>
                  <p className="text-muted">
                    <time dateTime={p.createdAt.toISOString()}>{fmtDate(p.createdAt)}</time> · Test payment
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-medium text-fg">{formatINR(p.amountPaise)}</span>
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
