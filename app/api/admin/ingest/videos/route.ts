import { ingestJson, ingestRoute, readJsonBody } from "@/lib/ingest/auth";
import { createVideoFromUploads } from "@/lib/ingest/service";

export const dynamic = "force-dynamic";

/** Turn completed uploads into a DRAFT video the admin finishes in the panel. */
export async function POST(req: Request) {
  return ingestRoute(req, async (auth) => ingestJson(await createVideoFromUploads(auth, await readJsonBody(req)), 201));
}
