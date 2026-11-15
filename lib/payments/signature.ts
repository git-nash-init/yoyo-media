import "server-only";
import { hmacSha256, safeEqual } from "@/lib/security/crypto";

export const TIMESTAMP_HEADER = "x-yoyo-timestamp";
export const SIGNATURE_HEADER = "x-yoyo-signature";
/** Webhooks older (or further in the future) than this are rejected. */
export const WEBHOOK_TOLERANCE_SEC = 300;

/** HMAC-SHA256(secret, `${timestamp}.${rawBody}`) as lowercase hex. `timestamp` is unix seconds. */
export function signWebhook(secret: string, timestamp: string, rawBody: string): string {
  return hmacSha256(secret, `${timestamp}.${rawBody}`);
}

export function verifyWebhookSignature(input: {
  secret: string;
  rawBody: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  nowMs?: number;
  toleranceSec?: number;
}): boolean {
  const { secret, rawBody, timestamp, signature } = input;
  if (!secret || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const ageSec = Math.abs((input.nowMs ?? Date.now()) / 1000 - Number(timestamp));
  if (ageSec > (input.toleranceSec ?? WEBHOOK_TOLERANCE_SEC)) return false;
  return safeEqual(signWebhook(secret, timestamp, rawBody), signature);
}
