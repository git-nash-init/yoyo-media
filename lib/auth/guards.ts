import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";

/** Only allow same-site relative paths as post-login destinations (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/browse"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

/**
 * Page/Server Action guards. Every protected page, action and route handler must
 * call one of these on the server; hiding UI is never the access control.
 */
export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

/** Signed in AND has an active subscription (admins pass). Others are sent to the paywall. */
export async function requireSubscriber(next?: string): Promise<CurrentUser> {
  const user = await requireUser(next);
  if (!user.isSubscriber) redirect(`/subscribe${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

/** ADMIN role with MFA enabled. Non-admins get the 403 page; admins without MFA are sent to set it up. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser("/admin");
  if (user.role !== "ADMIN") redirect("/forbidden");
  if (!user.mfaEnabled) redirect("/account/security?setup=required");
  return user;
}

/** Route Handler variants: return the user or a JSON error Response instead of redirecting. */
export async function apiUser(): Promise<CurrentUser | Response> {
  const user = await getCurrentUser();
  return user ?? Response.json({ error: "Sign in required", code: "SESSION_EXPIRED" }, { status: 401 });
}

export async function apiSubscriber(): Promise<CurrentUser | Response> {
  const user = await apiUser();
  if (user instanceof Response) return user;
  return user.isSubscriber
    ? user
    : Response.json({ error: "Subscription required", code: "SUBSCRIPTION_REQUIRED" }, { status: 403 });
}

export async function apiAdmin(): Promise<CurrentUser | Response> {
  const user = await apiUser();
  if (user instanceof Response) return user;
  return user.role === "ADMIN" && user.mfaEnabled
    ? user
    : Response.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
}
