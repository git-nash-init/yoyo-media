import { z } from "zod";
import { ipFromRequest } from "@/lib/security/ip";
import { rateLimit } from "@/lib/security/ratelimit";
import { MAX_QUERY_LENGTH, cleanQuery, quickSuggestions } from "@/lib/queries/search";

export const dynamic = "force-dynamic";

const schema = z.string().min(2).max(MAX_QUERY_LENGTH);

/** Typeahead suggestions for the header search box. Public catalogue data only (titles and names). */
export async function GET(req: Request) {
  const q = schema.safeParse(cleanQuery(new URL(req.url).searchParams.get("q")));
  if (!q.success) return Response.json({ suggestions: [] }, { headers: { "Cache-Control": "no-store" } });

  const rl = await rateLimit(`suggest:${ipFromRequest(req)}`, 60, 60);
  if (!rl.ok)
    return Response.json(
      { error: "Too many searches", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );

  const suggestions = await quickSuggestions(q.data);
  return Response.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
}
