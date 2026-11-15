import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { isProd } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/security/crypto";

export const SESSION_COOKIE = "yoyo_session";
const SESSION_DAYS = 14;
const MFA_PENDING_MINUTES = 10;

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  mfaEnabled: boolean;
  /** True when the user has an ACTIVE subscription that has not expired. Admins always count as subscribed. */
  isSubscriber: boolean;
  subscriptionExpiresAt: Date | null;
  sessionId: string;
};

/**
 * Create a session. The browser only ever holds an opaque random token in an
 * httpOnly cookie; the database stores its SHA-256 hash.
 * Pass `mfaPending: true` after a correct password when the account has MFA enabled.
 */
export async function createSession(userId: string, opts: { mfaPending?: boolean } = {}) {
  const token = randomToken(32);
  const h = await headers();
  const mfaPending = opts.mfaPending ?? false;
  const expiresAt = new Date(
    Date.now() + (mfaPending ? MFA_PENDING_MINUTES * 60_000 : SESSION_DAYS * 86_400_000),
  );
  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      mfaPending,
      expiresAt,
      userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
      ip: (h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? "").slice(0, 64) || null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

async function readSessionRow() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }
  return row;
}

/** Active subscription lookup (single source of truth for entitlement). */
export async function activeSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE", expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: "desc" },
  });
}

/** The fully signed-in user (password + MFA complete), or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const row = await readSessionRow();
  if (!row || row.mfaPending) return null;
  const sub = await activeSubscription(row.userId);
  return {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.user.role,
    mfaEnabled: row.user.mfaEnabled,
    isSubscriber: row.user.role === "ADMIN" || !!sub,
    subscriptionExpiresAt: sub?.expiresAt ?? null,
    sessionId: row.id,
  };
});

/** A session that passed the password step but still owes a TOTP code. */
export async function getPendingMfaSession() {
  const row = await readSessionRow();
  return row && row.mfaPending ? { sessionId: row.id, userId: row.userId, user: row.user } : null;
}

/** Promote a pending-MFA session to a full session (rotates the token). */
export async function completeMfa(sessionId: string, userId: string) {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  await createSession(userId);
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Sign out everywhere, e.g. after a password change. */
export async function destroyAllSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
}
