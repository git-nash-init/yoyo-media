import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Lightweight session probe for the SessionWatcher. Exposes two booleans only. */
export async function GET() {
  const user = await getCurrentUser();
  return Response.json(
    { authenticated: !!user, isSubscriber: !!user?.isSubscriber },
    { headers: { "Cache-Control": "no-store" } },
  );
}
