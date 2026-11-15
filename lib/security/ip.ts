import "server-only";
import { headers } from "next/headers";

/** Best-effort client IP for rate limiting and audit. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip")) || "unknown";
}

export function ipFromRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || "unknown";
}
