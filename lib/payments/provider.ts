import { z } from "zod";

/** Webhook event sent by a payment provider after a checkout finishes. */
export const paymentEventSchema = z.object({
  id: z.string().min(8).max(128),
  type: z.enum(["payment.succeeded", "payment.failed"]),
  providerRef: z.string().min(8).max(128),
  amountPaise: z.number().int().positive(),
  createdAt: z.string().max(64),
});
export type PaymentEvent = z.infer<typeof paymentEventSchema>;

export type CheckoutRequest = { userId: string; amountPaise: number; paymentId: string };
export type CheckoutResult = {
  /** The provider's own reference for this checkout; stored on Payment.providerRef. */
  providerRef: string;
  /** Hosted checkout URL, for providers that redirect the customer. The dummy provider has none. */
  checkoutUrl?: string;
};

/**
 * Everything the app needs from a payment provider. To move to a real gateway,
 * implement this interface and switch the export in lib/payments/index.ts.
 */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Authenticate and parse a webhook. Returns null when the signature, timestamp or payload is not valid. */
  verifyWebhook(rawBody: string, headers: Headers): PaymentEvent | null;
}
