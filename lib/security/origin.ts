import "server-only";
import { env } from "@/lib/env";

/**
 * CSRF defence for cookie-authenticated Route Handlers: state-changing requests
 * must come from our own origin. (Server Actions get the same check from Next.js.)
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Browsers send Origin on cross-site POSTs; without it, trust only Sec-Fetch-Site.
    return req.headers.get("sec-fetch-site") === "same-origin";
  }
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return o.host === host || o.origin === new URL(env.APP_URL).origin;
  } catch {
    return false;
  }
}

/** Returns a 403 Response for cross-origin requests, otherwise null. Use at the top of POST/PUT/PATCH/DELETE handlers. */
export function forbidCrossOrigin(req: Request): Response | null {
  return isSameOrigin(req) ? null : Response.json({ error: "Cross-origin request blocked" }, { status: 403 });
}
