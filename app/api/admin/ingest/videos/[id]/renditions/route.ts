import { ingestJson, ingestRoute, readJsonBody } from "@/lib/ingest/auth";
import { attachRenditions } from "@/lib/ingest/service";

export const dynamic = "force-dynamic";

/** Add lower-quality copies (480p, 360p ...) to a video that is already on the site. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return ingestRoute(req, async (auth) => ingestJson(await attachRenditions(auth, id, await readJsonBody(req))));
}
