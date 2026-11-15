"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { clientIp } from "@/lib/security/ip";
import { rateLimit } from "@/lib/security/ratelimit";
import { openSecret, sealSecret, sha256 } from "@/lib/security/crypto";
import { requireUser, safeNext } from "@/lib/auth/guards";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import {
  completeMfa,
  createSession,
  destroyAllSessions,
  destroySession,
  getPendingMfaSession,
} from "@/lib/auth/session";
import { generateSecret, verifyTotp } from "@/lib/auth/totp";
import {
  changePasswordSchema,
  confirmMfaSchema,
  disableMfaSchema,
  fieldErrorsFrom,
  loginSchema,
  mfaSchema,
  registerSchema,
  updateNameSchema,
  type ActionState,
} from "@/lib/auth/schemas";

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

function waitText(sec: number) {
  return sec >= 90 ? `${Math.ceil(sec / 60)} minutes` : `${sec} seconds`;
}

const tooMany = (sec: number): ActionState => ({
  ok: false,
  error: `Too many attempts. For your security, please wait ${waitText(sec)} and try again.`,
});

const SERVER_ERROR: ActionState = {
  ok: false,
  error: "Something went wrong on our side and nothing was saved. Please try again in a moment.",
};

/* ------------------------------------------------------------------ */
/* Register                                                            */
/* ------------------------------------------------------------------ */

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    name: str(formData, "name"),
    email: str(formData, "email"),
    password: str(formData, "password"),
    confirm: str(formData, "confirm"),
    next: str(formData, "next") || undefined,
  };
  const values = { name: raw.name, email: raw.email };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values };
  const { name, email, password, next } = parsed.data;

  const pwProblem = passwordProblem(password);
  if (pwProblem) return { ok: false, fieldErrors: { password: pwProblem }, values };

  const ip = await clientIp();
  const rl = await rateLimit(`register:${ip}`, 5, 3600);
  if (!rl.ok) return { ...tooMany(rl.retryAfterSec), values } as ActionState;

  let userId: string;
  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({ data: { name, email, passwordHash }, select: { id: true } });
    userId = user.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        ok: false,
        fieldErrors: { email: "An account with this email already exists. Sign in instead, or use a different email." },
        values,
      };
    }
    log.error("register failed", { error: e });
    return { ...SERVER_ERROR, values } as ActionState;
  }

  await createSession(userId);
  await audit(userId, "auth.register", userId, { ip });
  redirect(safeNext(next, "/subscribe"));
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

const LOGIN_FAILED = "Email or password is incorrect";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = {
    email: str(formData, "email"),
    password: str(formData, "password"),
    next: str(formData, "next") || undefined,
  };
  const values = { email: raw.email };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values };
  const { email, password, next } = parsed.data;

  const ip = await clientIp();
  const byIp = await rateLimit(`login:ip:${ip}`, 10, 600);
  // Hash the email so the key has a fixed length and no personal data sits in the rate-limit table.
  const byEmail = await rateLimit(`login:email:${sha256(email)}`, 10, 600);
  if (!byIp.ok || !byEmail.ok) {
    return { ...tooMany(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec)), values } as ActionState;
  }

  let user: { id: string; passwordHash: string; mfaEnabled: boolean; totpSecret: string | null } | null;
  let passwordOk: boolean;
  try {
    user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, mfaEnabled: true, totpSecret: true },
    });
    // Always run one argon2 verification so unknown emails take the same time as known ones.
    passwordOk = await verifyPassword(user?.passwordHash ?? (await dummyHash()), password);
  } catch (e) {
    log.error("login failed", { error: e });
    return { ...SERVER_ERROR, values } as ActionState;
  }

  if (!user || !passwordOk) {
    await audit(user?.id ?? null, "auth.login.failed", user?.id, { ip });
    return { ok: false, error: `${LOGIN_FAILED}. Check both and try again.`, values };
  }

  await destroySession(); // drop any older session held by this browser
  const dest = safeNext(next);
  if (user.mfaEnabled && user.totpSecret) {
    await createSession(user.id, { mfaPending: true });
    await audit(user.id, "auth.login.password_ok", user.id, { ip, mfa: true });
    redirect(`/mfa?next=${encodeURIComponent(dest)}`);
  }
  await createSession(user.id);
  await audit(user.id, "auth.login.success", user.id, { ip, mfa: false });
  redirect(dest);
}

/* ------------------------------------------------------------------ */
/* MFA step after password                                             */
/* ------------------------------------------------------------------ */

export async function verifyMfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const pending = await getPendingMfaSession();
  if (!pending) redirect("/login?expired=1");

  const parsed = mfaSchema.safeParse({ code: str(formData, "code"), next: str(formData, "next") || undefined });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const rl = await rateLimit(`mfa:${pending.userId}`, 5, 300);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const secret = pending.user.mfaEnabled ? openSecret(pending.user.totpSecret) : null;
  const valid = secret ? await verifyTotp(secret, parsed.data.code) : false;
  if (!valid) {
    await audit(pending.userId, "auth.mfa.failed", pending.userId, { ip: await clientIp() });
    return {
      ok: false,
      fieldErrors: {
        code: "That code is not right or has expired. Wait for a new code in your authenticator app and enter it.",
      },
    };
  }

  await completeMfa(pending.sessionId, pending.userId);
  await audit(pending.userId, "auth.login.success", pending.userId, { ip: await clientIp(), mfa: true });
  redirect(safeNext(parsed.data.next));
}

/** Abandon a half-finished sign-in (the "Use a different account" link on /mfa). */
export async function cancelMfaAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/* ------------------------------------------------------------------ */
/* Logout                                                              */
/* ------------------------------------------------------------------ */

/** Use as `<form action={logoutAction}>`. Ends this session and goes to the home page. */
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function logoutOthersAction(): Promise<ActionState> {
  const user = await requireUser("/account");
  try {
    await destroyAllSessions(user.id, user.sessionId);
  } catch (e) {
    log.error("logout others failed", { error: e });
    return SERVER_ERROR;
  }
  await audit(user.id, "auth.logout_others", user.id);
  revalidatePath("/account");
  return { ok: true, message: "Done. Every other device has been signed out; this one stays signed in." };
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export async function updateNameAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account");
  const raw = { name: str(formData, "name") };
  const parsed = updateNameSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: raw };

  const rl = await rateLimit(`profile:${user.id}`, 20, 3600);
  if (!rl.ok) return { ...tooMany(rl.retryAfterSec), values: raw } as ActionState;

  try {
    await prisma.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });
  } catch (e) {
    log.error("update name failed", { error: e });
    return { ...SERVER_ERROR, values: raw } as ActionState;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Name saved. It now shows across your account." };
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account");
  const parsed = changePasswordSchema.safeParse({
    currentPassword: str(formData, "currentPassword"),
    newPassword: str(formData, "newPassword"),
    confirm: str(formData, "confirm"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { currentPassword, newPassword } = parsed.data;

  const pwProblem = passwordProblem(newPassword);
  if (pwProblem) return { ok: false, fieldErrors: { newPassword: pwProblem } };

  const rl = await rateLimit(`pwchange:${user.id}`, 5, 900);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  try {
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!row || !(await verifyPassword(row.passwordHash, currentPassword))) {
      await audit(user.id, "auth.password_change.failed", user.id);
      return { ok: false, fieldErrors: { currentPassword: "That is not your current password. Check it and try again." } };
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    await destroyAllSessions(user.id, user.sessionId);
  } catch (e) {
    log.error("change password failed", { error: e });
    return SERVER_ERROR;
  }
  await audit(user.id, "auth.password_change", user.id);
  return {
    ok: true,
    message: "Password changed. All other devices were signed out; use the new password next time you sign in.",
  };
}

/* ------------------------------------------------------------------ */
/* MFA setup (/account/security)                                       */
/* ------------------------------------------------------------------ */

/** Generate a fresh pending secret. It only becomes active after a valid code is confirmed. */
export async function startMfaSetupAction(): Promise<ActionState> {
  const user = await requireUser("/account/security");
  const rl = await rateLimit(`mfa-setup:${user.id}`, 10, 3600);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  try {
    // The `mfaEnabled: false` filter means an already-protected account can never have its secret replaced here.
    const res = await prisma.user.updateMany({
      where: { id: user.id, mfaEnabled: false },
      data: { totpSecret: sealSecret(generateSecret()) },
    });
    if (res.count === 0) {
      return { ok: false, error: "Two-step sign-in is already on. Turn it off first if you want to set it up again." };
    }
  } catch (e) {
    log.error("mfa setup start failed", { error: e });
    return SERVER_ERROR;
  }
  revalidatePath("/account/security");
  return { ok: true };
}

export async function confirmMfaSetupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account/security");
  const parsed = confirmMfaSchema.safeParse({ code: str(formData, "code") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const rl = await rateLimit(`mfa:${user.id}`, 5, 300);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  try {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { totpSecret: true, mfaEnabled: true },
    });
    if (!row || row.mfaEnabled) return { ok: false, error: "Two-step sign-in is already on for this account." };
    if (!row.totpSecret) {
      return { ok: false, error: "Setup has not been started. Choose “Set up authenticator app” first." };
    }
    if (!(await verifyTotp(openSecret(row.totpSecret) ?? "", parsed.data.code))) {
      return {
        ok: false,
        fieldErrors: {
          code: "That code did not match. Check your device clock is automatic, then enter the newest code.",
        },
      };
    }
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await destroyAllSessions(user.id, user.sessionId);
  } catch (e) {
    log.error("mfa confirm failed", { error: e });
    return SERVER_ERROR;
  }
  await audit(user.id, "auth.mfa.enabled", user.id);
  revalidatePath("/account/security");
  return { ok: true, message: "Two-step sign-in is on. From now on you will be asked for a code after your password." };
}

export async function disableMfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account/security");
  const parsed = disableMfaSchema.safeParse({ currentPassword: str(formData, "currentPassword") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const rl = await rateLimit(`mfa-disable:${user.id}`, 5, 900);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  try {
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!row || !(await verifyPassword(row.passwordHash, parsed.data.currentPassword))) {
      await audit(user.id, "auth.mfa.disable_failed", user.id);
      return { ok: false, fieldErrors: { currentPassword: "That is not your current password. Check it and try again." } };
    }
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, totpSecret: null } });
  } catch (e) {
    log.error("mfa disable failed", { error: e });
    return SERVER_ERROR;
  }
  await audit(user.id, "auth.mfa.disabled", user.id);
  revalidatePath("/account/security");
  return { ok: true, message: "Two-step sign-in is off. Your account is now protected by your password only." };
}
