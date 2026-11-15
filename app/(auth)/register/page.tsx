import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/AuthForms";
import { safeNext } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create account" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next), "/subscribe");
  if (await getCurrentUser()) redirect(next);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-fg">Create your account</h1>
        <p className="mt-1 text-sm text-muted">It takes a minute. Next you will choose your plan and start watching.</p>
      </div>
      <RegisterForm next={next} />
    </div>
  );
}
