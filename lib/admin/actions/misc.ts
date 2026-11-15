"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { setSetting } from "@/lib/settings";
import {
  fieldErrorsOf,
  grantExpiry,
  grantSchema,
  idSchema,
  settingsSchema,
  settingsToStored,
  tokenNameSchema,
  type ActionResult,
} from "@/lib/admin/logic";
import { formText } from "@/lib/admin/server";

const BAD_INPUT: ActionResult = { ok: false, error: "The request was not valid. Reload the page and try again." };
const FIX_FIELDS = "Some fields need attention. Fix the highlighted fields and save again.";

// ---------- Subscribers ----------

export async function grantSubscriptionAction(userId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(userId).success) return BAD_INPUT;

  const parsed = grantSchema.safeParse({ days: formText(formData, "days"), note: formText(formData, "note") });
  if (!parsed.success) return { ok: false, error: FIX_FIELDS, fieldErrors: fieldErrorsOf(parsed.error) };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { ok: false, error: "This user no longer exists." };

  const now = new Date();
  const current = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE", expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" },
    select: { expiresAt: true },
  });
  const expiresAt = grantExpiry(now, current?.expiresAt ?? null, parsed.data.days);
  const note = `Manual grant by ${admin.name}: ${parsed.data.days} days${parsed.data.note ? ` — ${parsed.data.note}` : ""}`.slice(0, 255);

  const sub = await prisma.subscription.create({
    data: { userId, status: "ACTIVE", startsAt: now, expiresAt, note },
  });
  await audit(admin.id, "subscription.grant", `user:${userId}`, { days: parsed.data.days, subscriptionId: sub.id });
  revalidatePath("/admin/subscribers");
  revalidatePath(`/admin/subscribers/${userId}`);
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Access granted for ${parsed.data.days} days. It now runs until ${expiresAt.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}.`,
  };
}

export async function revokeSubscriptionAction(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(userId).success) return BAD_INPUT;

  const res = await prisma.subscription.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "CANCELLED" },
  });
  if (res.count === 0) return { ok: false, error: "This user has no active subscription to revoke." };

  await audit(admin.id, "subscription.revoke", `user:${userId}`, { cancelled: res.count });
  revalidatePath("/admin/subscribers");
  revalidatePath(`/admin/subscribers/${userId}`);
  revalidatePath("/admin");
  return { ok: true, message: "Access revoked. The user will see the paywall on their next page load." };
}

// ---------- Ingest tokens ----------

export async function createIngestTokenAction(
  _prev: ActionResult<{ token?: string; name?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ token?: string; name?: string }>> {
  const admin = await requireAdmin();
  const parsed = tokenNameSchema.safeParse({ name: formText(formData, "name") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  // Only the SHA-256 hash is stored; the full token is returned to the admin exactly once.
  const token = `yoyo_ing_${randomToken(32)}`;
  const row = await prisma.ingestToken.create({ data: { name: parsed.data.name, tokenHash: sha256(token) } });
  await audit(admin.id, "ingest_token.create", `ingest_token:${row.id}`, { name: parsed.data.name });
  revalidatePath("/admin/ingest");
  return { ok: true, token, name: parsed.data.name };
}

export async function revokeIngestTokenAction(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(id).success) return BAD_INPUT;

  const res = await prisma.ingestToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) return { ok: false, error: "This token was already revoked or deleted." };

  await audit(admin.id, "ingest_token.revoke", `ingest_token:${id}`);
  revalidatePath("/admin/ingest");
  return { ok: true, message: "Token revoked. YoYo Studio can no longer push with it." };
}

// ---------- Settings ----------

export async function saveSettingsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = settingsSchema.safeParse({
    price_rupees: formText(formData, "price_rupees"),
    plan_days: formText(formData, "plan_days"),
    watermark_enabled: formText(formData, "watermark_enabled"),
    watermark_position: formText(formData, "watermark_position"),
    hero_title: formText(formData, "hero_title"),
    hero_subtitle: formText(formData, "hero_subtitle"),
  });
  if (!parsed.success) return { ok: false, error: FIX_FIELDS, fieldErrors: fieldErrorsOf(parsed.error) };

  const stored = settingsToStored(parsed.data);
  for (const [key, value] of Object.entries(stored)) {
    await setSetting(key as keyof typeof stored, value);
  }
  await audit(admin.id, "settings.update", "settings", stored);
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved. New prices apply to the next checkout; existing subscriptions are unchanged." };
}
