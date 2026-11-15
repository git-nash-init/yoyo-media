import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui";
import { LoginForm } from "@/components/auth/AuthForms";
import { safeNext } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  if (await getCurrentUser()) redirect(next);
  const expired = first(sp.expired) === "1";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-fg">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Enter your details to continue watching</p>
      </div>
      {expired ? (
        <Alert tone="warning">
          Your sign-in took too long and expired for security. Enter your email and password again to continue.
        </Alert>
      ) : null}
      <LoginForm next={next} />
    </div>
  );
}
