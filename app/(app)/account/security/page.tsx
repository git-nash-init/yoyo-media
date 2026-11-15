import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Alert, Badge, ButtonLink, Card } from "@/components/ui";
import { ConfirmMfaForm, DisableMfaForm, StartMfaButton } from "@/components/auth/AccountForms";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { openSecret } from "@/lib/security/crypto";
import { formatSecret, keyuri } from "@/lib/auth/totp";

export const metadata: Metadata = { title: "Two-step sign-in" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const setupRequired = first(sp.setup) === "required";
  const user = await requireUser("/account/security");
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { totpSecret: true, mfaEnabled: true },
  });
  const enabled = !!row?.mfaEnabled;
  const pendingSecret = !enabled ? openSecret(row?.totpSecret) : null;

  // The QR is rendered on the server as a data-URL image; the secret is only ever shown to its owner.
  const qr = pendingSecret
    ? await QRCode.toDataURL(keyuri(user.email, pendingSecret), { margin: 1, width: 220, errorCorrectionLevel: "M" })
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div>
        <Link href="/account" className="text-sm font-medium text-muted hover:text-fg">
          ← Back to account
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl text-fg">Two-step sign-in</h1>
          {enabled ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted">
          After your password, you enter a 6-digit code from an authenticator app on your phone. Even if someone learns
          your password, they cannot sign in without your phone.
        </p>
      </div>

      {setupRequired && !enabled ? (
        <Alert tone="warning">
          Admin accounts must turn on two-step sign-in before opening the admin area. Complete the setup below, then go
          back to the admin area.
        </Alert>
      ) : null}

      {enabled ? (
        <>
          <Card className="p-5 sm:p-6" role="status">
            <h2 className="text-lg font-medium text-fg">Your account is protected</h2>
            <p className="mt-1 text-sm text-muted">
              You will be asked for a code from your authenticator app every time you sign in.
            </p>
            {user.role === "ADMIN" ? (
              <ButtonLink href="/admin" className="mt-4">
                Open the admin area
              </ButtonLink>
            ) : null}
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-medium text-fg">Turn off two-step sign-in</h2>
            <p className="mt-1 text-sm text-muted">
              Your account will be protected by your password only.
              {user.role === "ADMIN" ? " Admins cannot open the admin area while this is off." : ""}
            </p>
            <div className="mt-4 max-w-md">
              <DisableMfaForm />
            </div>
          </Card>
        </>
      ) : pendingSecret && qr ? (
        <Card className="space-y-6 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-medium text-fg">Step 1: Add YoYo Videos to your authenticator app</h2>
            <p className="mt-1 text-sm text-muted">
              Open any authenticator app, choose to add an account, and scan this QR code.
            </p>
            <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL, nothing to optimise */}
              <img
                src={qr}
                width={220}
                height={220}
                alt="QR code to add YoYo Videos to an authenticator app"
                className="rounded-xl bg-white p-2"
              />
              <div className="min-w-0 text-sm">
                <p className="text-muted">Cannot scan? Enter this key by hand (time-based, 6 digits):</p>
                <code className="mt-2 block select-all break-all rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-fg">
                  {formatSecret(pendingSecret)}
                </code>
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-medium text-fg">Step 2: Enter the code it shows</h2>
            <p className="mt-1 text-sm text-muted">This confirms the app is set up correctly before we switch it on.</p>
            <div className="mt-4 max-w-md">
              <ConfirmMfaForm />
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <p className="mb-3 text-sm text-muted">Scanned with the wrong phone or lost the key?</p>
            <StartMfaButton label="Start over with a new key" variant="secondary" />
          </div>
        </Card>
      ) : (
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-medium text-fg">Two-step sign-in is off</h2>
          <p className="mt-1 text-sm text-muted">
            You will need an authenticator app on your phone. Setup takes about a minute.
          </p>
          <div className="mt-4">
            <StartMfaButton />
          </div>
        </Card>
      )}
    </div>
  );
}
