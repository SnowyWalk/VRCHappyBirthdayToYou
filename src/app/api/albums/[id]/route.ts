import { NextResponse } from "next/server";
import {
  getBearerToken,
  getImageInputs,
  getRemoveList,
  getRequiredString,
  getRevision,
  getRequestOrigin,
  jsonError,
  readBoundedFormData,
} from "@/lib/api";
import { getAlbumDataUrl, readAlbumForEdit, updateAlbum } from "@/lib/storage";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const album = await readAlbumForEdit(id, getBearerToken(request));
    return NextResponse.json({
      album,
      dataUrl: getAlbumDataUrl(
        album.id,
        getRequestOrigin(request),
        album.atlasId,
        album.nickname,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const token = getBearerToken(request);
    await readAlbumForEdit(id, token);
    const formData = await readBoundedFormData(request);
    const album = await updateAlbum(id, token, {
      nickname: getRequiredString(formData, "nickname"),
      revision: getRevision(formData),
      remove: getRemoveList(formData),
      images: await getImageInputs(formData),
    });

    return NextResponse.json({
      album,
      dataUrl: getAlbumDataUrl(
        album.id,
        getRequestOrigin(request),
        album.atlasId,
        album.nickname,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}
