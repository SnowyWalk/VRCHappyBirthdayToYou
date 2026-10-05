import { NextResponse } from "next/server";
import { resolveAtlasAlbums } from "@/lib/storage";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const hash = new URL(request.url).searchParams.get("atlas") ?? "";
    return NextResponse.json(
      { ids: await resolveAtlasAlbums(hash) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
