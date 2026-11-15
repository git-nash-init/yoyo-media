import { log } from "@/lib/logger";
import { applyPaymentEvent, paymentProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Payment provider webhook. This is a server-to-server call with no browser
 * session, so it is authenticated by an HMAC signature over the raw body and a
 * timestamp (max 5 minutes old) instead of cookies and an Origin check.
 * Payment success is only ever decided here, never by the browser.
 */
export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);

  const rawBody = await req.text();
  if (!rawBody || rawBody.length > MAX_BODY_BYTES) return json({ error: "Invalid payload" }, 400);

  const event = paymentProvider.verifyWebhook(rawBody, req.headers);
  if (!event) {
    log.warn("payment webhook rejected: bad signature, stale timestamp or malformed event");
    return json({ error: "Invalid signature" }, 401);
  }

  try {
    const outcome = await applyPaymentEvent(event);
    if (outcome.status === "rejected") {
      log.warn("payment webhook rejected", { reason: outcome.reason, eventId: event.id });
      return json({ error: "Event does not match a payment" }, 400);
    }
    return json({ ok: true, duplicate: outcome.status === "duplicate" }, 200);
  } catch (e) {
    log.error("payment webhook failed", { error: e, eventId: event.id });
    // 500 lets the provider retry; the event id was rolled back with the transaction.
    return json({ error: "Temporary failure" }, 500);
  }
}
