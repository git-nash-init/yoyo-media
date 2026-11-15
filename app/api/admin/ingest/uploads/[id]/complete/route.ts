import { ingestJson, ingestRoute } from "@/lib/ingest/auth";
import { completeUpload } from "@/lib/ingest/service";

export const dynamic = "force-dynamic";

/** Verify the SHA-256 of a fully received upload and move it to its final folder. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return ingestRoute(req, async (auth) => ingestJson(await completeUpload(auth, id)));
}
