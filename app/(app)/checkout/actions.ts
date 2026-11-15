"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { requireUser, safeNext } from "@/lib/auth/guards";
import type { ActionState } from "@/lib/auth/schemas";
import { rateLimit } from "@/lib/security/ratelimit";
import { createCheckoutPayment } from "@/lib/payments";
import { simulateDummyOutcome } from "@/lib/payments/dummy";

const schema = z.object({
  outcome: z.enum(["succeeded", "failed"]),
  next: z.string().max(2000).optional(),
});

/**
 * Test checkout. Creates a PENDING payment, then plays the payment gateway by
 * sending a signed webhook to our own endpoint. The result shown to the user is
 * always re-read from the database; nothing from the browser decides success.
 */
export async function payTestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/checkout");

  const next = formData.get("next");
  const parsed = schema.safeParse({
    outcome: formData.get("outcome"),
    next: typeof next === "string" && next ? next : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "That request was not valid. Reload the page and choose a payment button again." };
  }
  const dest = safeNext(parsed.data.next, "/browse");

  const rl = await rateLimit(`checkout:${user.id}`, 10, 3600);
  if (!rl.ok) {
    return {
      ok: false,
      error: `You have started too many checkouts. Nothing was charged. Please wait ${Math.ceil(rl.retryAfterSec / 60)} minutes and try again.`,
    };
  }

  let paymentId: string;
  let status: string;
  try {
    const payment = await createCheckoutPayment(user.id);
    paymentId = payment.id;
    await simulateDummyOutcome(payment.providerRef, payment.amountPaise, parsed.data.outcome);
    const fresh = await prisma.payment.findFirst({
      where: { id: payment.id, userId: user.id },
      select: { status: true },
    });
    status = fresh?.status ?? "PENDING";
  } catch (e) {
    log.error("checkout failed", { error: e });
    return {
      ok: false,
      error: "We could not start the payment because of a problem on our side. You were not charged. Please try again.",
    };
  }

  const q = `next=${encodeURIComponent(dest)}`;
  if (status === "PAID") redirect(`/checkout/success?${q}`);
  redirect(`/checkout?${q}&attempt=${encodeURIComponent(paymentId)}`);
}
