import { NextResponse } from "next/server";
import { PANELS } from "./panels";
import { isPanelId, StorageError, type ImageInput } from "./storage";

import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "./upload-limits";

export function jsonError(error: unknown) {
  if (error instanceof StorageError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: "서버 오류가 발생했습니다." },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new StorageError(401, "편집 토큰이 필요합니다.");
  }
  return match[1];
}

export function getRequestOrigin(request: Request) {
  // Next's internal URL may use the bind address (0.0.0.0), while Host
  // contains the domain the browser actually opened. Production proxies
  // should set PUBLIC_BASE_URL explicitly rather than relying on headers.
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host) url.host = host;
  return url.origin;
}

export async function readBoundedFormData(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_UPLOAD_BYTES) {
    throw new StorageError(413, `업로드는 한 번에 ${MAX_UPLOAD_MB}MB 이하만 가능합니다.`);
  }

  if (!request.body) {
    throw new StorageError(400, "요청 본문이 비어 있습니다.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    total += value.byteLength;
    if (total > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      throw new StorageError(413, `업로드는 한 번에 ${MAX_UPLOAD_MB}MB 이하만 가능합니다.`);
    }
    chunks.push(value);
  }

  const bodyParts = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });
  const body = new Blob(bodyParts);
  const formRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  });

  try {
    return await formRequest.formData();
  } catch {
    throw new StorageError(400, "multipart 요청 형식이 올바르지 않습니다.");
  }
}

export function getRequiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") {
    throw new StorageError(400, `${key} 값이 필요합니다.`);
  }
  return value;
}

export function getRevision(formData: FormData) {
  const value = getRequiredString(formData, "revision");
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new StorageError(400, "revision 값이 올바르지 않습니다.");
  }
  return revision;
}

export function getRemoveList(formData: FormData) {
  const value = formData.get("remove");
  if (value === null || value === "") {
    return [];
  }
  if (typeof value !== "string") {
    throw new StorageError(400, "remove 값이 올바르지 않습니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new StorageError(400, "remove 값이 JSON 배열이어야 합니다.");
  }

  if (
    !Array.isArray(parsed) ||
    parsed.some((entry) => typeof entry !== "string" || !isPanelId(entry))
  ) {
    throw new StorageError(400, "remove 배열에 알 수 없는 패널이 있습니다.");
  }

  return parsed;
}

export async function getImageInputs(formData: FormData) {
  const images: ImageInput[] = [];
  const seen = new Set<string>();

  for (const [key, value] of formData.entries()) {
    if (["nickname", "revision", "remove"].includes(key)) {
      continue;
    }

    if (!isPanelId(key)) {
      throw new StorageError(400, "알 수 없는 패널 파일 필드입니다.");
    }

    if (seen.has(key)) {
      throw new StorageError(
        400,
        "같은 패널에 이미지가 여러 개 업로드되었습니다.",
      );
    }
    seen.add(key);

    if (seen.size > PANELS.length) {
      throw new StorageError(400, "업로드된 이미지 수가 패널 수보다 많습니다.");
    }

    if (!(value instanceof File)) {
      throw new StorageError(400, "이미지 파일 값이 올바르지 않습니다.");
    }

    images.push({
      panelId: key,
      bytes: new Uint8Array(await value.arrayBuffer()),
    });
  }

  return images;
}
