import { IngestError, ingestJson, ingestRoute, readBodyCapped } from "@/lib/ingest/auth";
import { appendChunk, getUpload } from "@/lib/ingest/service";
import { MAX_CHUNK_BYTES, parseOffset } from "@/lib/ingest/rules";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Upload status, used by Studio to resume after an interruption. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return ingestRoute(req, async (auth) => ingestJson(await getUpload(auth, id)));
}

/** Append one raw binary chunk at `?offset=N` (must equal the bytes received so far). */
export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return ingestRoute(req, async (auth) => {
    const offset = parseOffset(new URL(req.url).searchParams.get("offset"));
    if (offset == null) throw new IngestError(400, "BAD_OFFSET", "The offset query parameter is required");

    const chunkSha = req.headers.get("x-chunk-sha256");
    if (chunkSha && !/^[a-fA-F0-9]{64}$/.test(chunkSha))
      throw new IngestError(400, "INVALID_INPUT", "X-Chunk-Sha256 must be 64 hex characters");

    const chunk = await readBodyCapped(req, MAX_CHUNK_BYTES);
    if (!chunk) throw new IngestError(413, "CHUNK_TOO_LARGE", `A chunk may be at most ${MAX_CHUNK_BYTES} bytes`);

    return ingestJson(await appendChunk(auth, id, offset, chunk, chunkSha));
  });
}
