import { ingestJson, ingestRoute, readJsonBody } from "@/lib/ingest/auth";
import { createVideoFromUploads, findVideosByTitle } from "@/lib/ingest/service";

export const dynamic = "force-dynamic";

/** Turn completed uploads into a DRAFT video the admin finishes in the panel. */
export async function POST(req: Request) {
  return ingestRoute(req, async (auth) => ingestJson(await createVideoFromUploads(auth, await readJsonBody(req)), 201));
}

/** Look up videos by exact title (Studio's backfill uses this to find the video a file belongs to). */
export async function GET(req: Request) {
  return ingestRoute(req, async () => ingestJson(await findVideosByTitle(new URL(req.url).searchParams.get("title") ?? "")));
}
