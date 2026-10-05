import {
  MAX_IMAGE_BYTES,
  MAX_PHOTO_EDGE,
  MAX_SOURCE_IMAGE_BYTES,
  MAX_SOURCE_IMAGE_MB,
} from "./upload-limits";

/** Decode, orient and resize locally. The original file never leaves the device. */
export async function preparePhoto(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("JPG, PNG, WebP 사진만 선택할 수 있어요.");
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error(`사진 한 장은 ${MAX_SOURCE_IMAGE_MB}MB 이하여야 해요.`);
  }

  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    image.src = sourceUrl;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width * 9 !== height * 16 && width * 16 !== height * 9) {
      throw new Error(`가로 16:9 또는 세로 9:16 사진만 사용할 수 있어요. 선택한 사진은 ${width}×${height}px입니다. 사진을 자르거나 여백을 넣어 비율을 맞춰 주세요.`);
    }

    const landscape = width > height;
    // Keep the resized image on exact 16:9 / 9:16 integer dimensions so the
    // server-side atlas validator receives the same shape the user approved.
    const unit = Math.max(
      1,
      Math.floor(Math.min(Math.max(width, height), MAX_PHOTO_EDGE) / 16),
    );
    canvas = document.createElement("canvas");
    canvas.width = unit * (landscape ? 16 : 9);
    canvas.height = unit * (landscape ? 9 : 16);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("사진을 줄일 수 없어요. 다른 브라우저에서 다시 시도해 주세요.");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await encodeBoundedPhoto(canvas);
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new Error("사진을 줄인 후에도 용량이 너무 커요. 다른 사진을 선택해 주세요.");
    }
    const ext = blob.type === "image/webp" ? "webp" : "png";
    return {
      file: new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: blob.type }),
      orientation: landscape ? "landscape" as const : "portrait" as const,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
    image.src = "";
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

async function encodeBoundedPhoto(canvas: HTMLCanvasElement) {
  for (const quality of [0.92, 0.82, 0.72, 0.62]) {
    const blob = await encodeCanvas(canvas, "image/webp", quality);
    // Browsers without a WebP encoder fall back to PNG, which also keeps alpha.
    if (blob.size <= MAX_IMAGE_BYTES) {
      return blob;
    }
    if (blob.type !== "image/webp") break;
  }
  throw new Error("사진을 줄인 후에도 용량이 너무 커요. 다른 사진을 선택해 주세요.");
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: "image/webp",
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("사진 압축에 실패했어요. 다시 시도해 주세요.")),
      type,
      quality,
    );
  });
}
