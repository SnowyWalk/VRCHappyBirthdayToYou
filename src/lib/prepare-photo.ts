import {
  MAX_IMAGE_BYTES,
  MAX_PHOTO_EDGE,
  MAX_SOURCE_IMAGE_PIXELS,
} from "./upload-limits";
import { readPhotoSize } from "./photo-size";

export type PhotoOrientation = "landscape" | "portrait";
export type PhotoFramingMode = "crop" | "contain";

export type PhotoFramingOptions = {
  orientation: PhotoOrientation;
  mode: PhotoFramingMode;
  /** Crop offset from the start edge to the end edge. Defaults to center. */
  position?: number;
};

export class PhotoRatioError extends Error {
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    super(`가로 16:9 또는 세로 9:16 사진만 사용할 수 있어요. 선택한 사진은 ${width}×${height}px입니다. 사진을 자르거나 여백을 넣어 비율을 맞춰 주세요.`);
    this.name = "PhotoRatioError";
    this.width = width;
    this.height = height;
  }
}

/** Decode, orient and resize locally. The original file never leaves the device. */
export async function preparePhoto(file: File, framing?: PhotoFramingOptions) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("JPG, PNG, WebP 사진만 선택할 수 있어요.");
  }
  const original = await readPhotoSize(file);
  assertPixelLimit(original.width, original.height);

  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    image.src = sourceUrl;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    assertPixelLimit(width, height);
    if (width * 9 !== height * 16 && width * 16 !== height * 9) {
      if (!framing) {
        throw new PhotoRatioError(width, height);
      }
    }

    const orientation = framing?.orientation ?? (width > height ? "landscape" : "portrait");
    const landscape = orientation === "landscape";
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
    drawFramedImage(context, image, width, height, canvas.width, canvas.height, framing);
    const blob = await encodeBoundedPhoto(canvas);
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new Error("사진을 줄인 후에도 용량이 너무 커요. 다른 사진을 선택해 주세요.");
    }
    const ext = blob.type === "image/webp" ? "webp" : "png";
    return {
      file: new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: blob.type }),
      orientation,
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

function drawFramedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  framing: PhotoFramingOptions | undefined,
) {
  if (framing?.mode !== "contain") {
    const targetRatio = targetWidth / targetHeight;
    const sourceRatio = sourceWidth / sourceHeight;
    const position = clamp01(framing?.position ?? 0.5);
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;

    if (sourceRatio > targetRatio) {
      sw = sourceHeight * targetRatio;
      sx = (sourceWidth - sw) * position;
    } else if (sourceRatio < targetRatio) {
      sh = sourceWidth / targetRatio;
      sy = (sourceHeight - sh) * position;
    }

    context.drawImage(image, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
    return;
  }

  context.fillStyle = "#000";
  context.fillRect(0, 0, targetWidth, targetHeight);
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawnWidth = sourceWidth * scale;
  const drawnHeight = sourceHeight * scale;
  context.drawImage(
    image,
    (targetWidth - drawnWidth) / 2,
    (targetHeight - drawnHeight) / 2,
    drawnWidth,
    drawnHeight,
  );
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function assertPixelLimit(width: number, height: number) {
  if (width * height > MAX_SOURCE_IMAGE_PIXELS) {
    throw new Error(`사진은 4천만 픽셀 이하로 선택해 주세요. 선택한 사진은 ${width}×${height}px입니다. 해상도를 낮춘 뒤 다시 선택해 주세요.`);
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
