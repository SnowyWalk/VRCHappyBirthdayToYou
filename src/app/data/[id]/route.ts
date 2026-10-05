import { NextResponse } from "next/server";
import { getRequestOrigin, jsonError } from "@/lib/api";
import { readPublicManifest } from "@/lib/storage";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const manifest = await readPublicManifest(id, getRequestOrigin(request));
    return NextResponse.json(manifest, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
