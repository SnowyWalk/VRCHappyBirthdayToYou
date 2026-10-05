import { NextResponse } from "next/server";
import { createAlbum, getAlbumDataUrl } from "@/lib/storage";
import { getRequestOrigin, jsonError } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const result = await createAlbum();
    return NextResponse.json(
      {
        ...result,
        dataUrl: getAlbumDataUrl(
          result.album.id,
          getRequestOrigin(request),
          result.album.atlasId,
          result.album.nickname,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
