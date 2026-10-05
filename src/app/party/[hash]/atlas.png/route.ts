import { jsonError } from "@/lib/api";
import { getPartyAtlas } from "@/lib/storage";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ hash: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const { hash } = await params;
    const atlas = await getPartyAtlas(hash);
    return new Response(atlas.bytes, {
      headers: {
        "Cache-Control": "no-store, no-transform",
        "Content-Type": atlas.contentType,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
