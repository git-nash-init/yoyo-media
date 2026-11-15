import { ingestJson, ingestRoute, readJsonBody } from "@/lib/ingest/auth";
import { startUpload } from "@/lib/ingest/service";

export const dynamic = "force-dynamic";

/** Start a resumable chunked upload. */
export async function POST(req: Request) {
  return ingestRoute(req, async (auth) => ingestJson(await startUpload(auth, await readJsonBody(req)), 201));
}
