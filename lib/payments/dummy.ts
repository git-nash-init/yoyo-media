import "server-only";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { randomToken } from "@/lib/security/crypto";
import { paymentEventSchema, type PaymentEvent, type PaymentProvider } from "./provider";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signWebhook, verifyWebhookSignature } from "./signature";

/**
 * Test payment provider. No money moves: `simulateDummyOutcome` plays the role
 * of the gateway and calls our webhook exactly like a real one would, so the
 * app's own code path (signature check, replay protection, activation) is real.
 */
export const dummyProvider: PaymentProvider = {
  name: "dummy",

  async createCheckout() {
    return { providerRef: `dummy_${randomToken(18)}` };
  },

  verifyWebhook(rawBody, headers): PaymentEvent | null {
    const ok = verifyWebhookSignature({
      secret: env.PAYMENT_WEBHOOK_SECRET,
      rawBody,
      timestamp: headers.get(TIMESTAMP_HEADER),
      signature: headers.get(SIGNATURE_HEADER),
    });
    if (!ok) return null;
    try {
      const parsed = paymentEventSchema.safeParse(JSON.parse(rawBody));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
};

/**
 * Act as the payment gateway: build a signed event and POST it server-to-server
 * to our own webhook. The URL is always built from APP_URL, never from user input.
 * Returns true when the webhook accepted the event.
 */
export async function simulateDummyOutcome(
  providerRef: string,
  amountPaise: number,
  outcome: "succeeded" | "failed",
): Promise<boolean> {
  const event: PaymentEvent = {
    id: `evt_${randomToken(16)}`,
    type: outcome === "succeeded" ? "payment.succeeded" : "payment.failed",
    providerRef,
    amountPaise,
    createdAt: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  try {
    const res = await fetch(new URL("/api/webhooks/payment", env.APP_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TIMESTAMP_HEADER]: timestamp,
        [SIGNATURE_HEADER]: signWebhook(env.PAYMENT_WEBHOOK_SECRET, timestamp, rawBody),
      },
      body: rawBody,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) log.warn("dummy payment webhook rejected", { status: res.status });
    return res.ok;
  } catch (e) {
    log.error("dummy payment webhook unreachable", { error: e });
    return false;
  }
}
