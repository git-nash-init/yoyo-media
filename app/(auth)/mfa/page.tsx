import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaForm } from "@/components/auth/AuthForms";
import { safeNext } from "@/lib/auth/guards";
import { getCurrentUser, getPendingMfaSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Two-step sign-in" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  if (await getCurrentUser()) redirect(next);
  const pending = await getPendingMfaSession();
  if (!pending) redirect(`/login?expired=1&next=${encodeURIComponent(next)}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-fg">Two-step sign-in</h1>
        <p className="mt-1 text-sm text-muted">
          Your password was correct. One more step keeps your account safe: enter the code from your authenticator app.
        </p>
      </div>
      <MfaForm next={next} />
    </div>
  );
}
