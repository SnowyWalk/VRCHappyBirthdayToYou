import { jsonError } from "@/lib/api";
import { getMedia } from "@/lib/storage";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string; hash: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, hash } = await params;
    const image = await getMedia(id, hash);
    return new Response(image.bytes, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, immutable, max-age=31536000",
        "Content-Type": image.contentType,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
