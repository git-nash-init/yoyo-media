import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getPlan } from "@/lib/settings";
import { randomToken } from "@/lib/security/crypto";
import { dummyProvider } from "./dummy";
import type { PaymentEvent, PaymentProvider } from "./provider";

export type { PaymentEvent, PaymentProvider } from "./provider";

/** The active payment provider. Swap this one line to move to a real gateway. */
export const paymentProvider: PaymentProvider = dummyProvider;

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Create a PENDING payment for the current plan price and register it with the provider. */
export async function createCheckoutPayment(userId: string) {
  const plan = await getPlan();
  const payment = await prisma.payment.create({
    data: {
      userId,
      provider: paymentProvider.name,
      // Placeholder until the provider returns its own reference.
      providerRef: `pending_${randomToken(18)}`,
      amountPaise: plan.pricePaise,
      status: "PENDING",
    },
  });
  const checkout = await paymentProvider.createCheckout({
    userId,
    amountPaise: plan.pricePaise,
    paymentId: payment.id,
  });
  return prisma.payment.update({ where: { id: payment.id }, data: { providerRef: checkout.providerRef } });
}

type Tx = Prisma.TransactionClient;

async function activateInTx(tx: Tx, paymentId: string, days: number) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { subscription: true } });
  if (!payment) return null;
  if (payment.subscription) return payment.subscription; // already activated

  if (payment.status !== "PAID") {
    await tx.payment.update({ where: { id: payment.id }, data: { status: "PAID", paidAt: new Date() } });
  }
  const now = new Date();
  const current = await tx.subscription.findFirst({
    where: { userId: payment.userId, status: "ACTIVE", expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" },
  });
  const base = current ? current.expiresAt : now;
  return tx.subscription.create({
    data: {
      userId: payment.userId,
      status: "ACTIVE",
      startsAt: now,
      expiresAt: new Date(base.getTime() + days * 86_400_000),
      paymentId: payment.id, // unique: one payment can never grant two subscriptions
    },
  });
}

/**
 * Mark a payment PAID and grant the subscription it bought. Idempotent: calling
 * it again for the same payment returns the existing subscription.
 * New expiry = max(now, current active expiry) + plan days.
 */
export async function activateSubscription(paymentId: string) {
  const { days } = await getPlan();
  try {
    return await prisma.$transaction((tx) => activateInTx(tx, paymentId, days));
  } catch (e) {
    if (isUniqueViolation(e)) return prisma.subscription.findUnique({ where: { paymentId } });
    throw e;
  }
}

export type WebhookOutcome =
  | { status: "processed" | "duplicate" }
  | { status: "rejected"; reason: "unknown_payment" | "amount_mismatch" };

/**
 * Apply a verified provider event. The event id is recorded in the same
 * transaction as the state change, so a replayed event is a no-op while an
 * attempt that crashed half-way can still be retried by the provider.
 */
export async function applyPaymentEvent(event: PaymentEvent): Promise<WebhookOutcome> {
  const payment = await prisma.payment.findUnique({ where: { providerRef: event.providerRef } });
  if (!payment || payment.provider !== paymentProvider.name) return { status: "rejected", reason: "unknown_payment" };
  if (payment.amountPaise !== event.amountPaise) return { status: "rejected", reason: "amount_mismatch" };

  const { days } = await getPlan();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({ data: { eventId: event.id } });
      if (event.type === "payment.succeeded") {
        await activateInTx(tx, payment.id, days);
      } else {
        // A failure never downgrades a payment that already succeeded.
        await tx.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED" } });
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { status: "duplicate" };
    throw e;
  }
  await audit(payment.userId, event.type === "payment.succeeded" ? "payment.paid" : "payment.failed", payment.id, {
    amountPaise: payment.amountPaise,
    provider: payment.provider,
  });
  return { status: "processed" };
}
