import { ingestJson, ingestRoute } from "@/lib/ingest/auth";
import { pingInfo } from "@/lib/ingest/service";

export const dynamic = "force-dynamic";

/** Lets YoYo Studio validate its site URL and token before doing any work. */
export async function GET(req: Request) {
  return ingestRoute(req, async (auth) => ingestJson(pingInfo(auth)));
}
