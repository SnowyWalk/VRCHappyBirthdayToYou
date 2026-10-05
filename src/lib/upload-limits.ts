// Source files stay on the device; only resized photos are uploaded.
export const MAX_SOURCE_IMAGE_PIXELS = 40_000_000;
export const MAX_PHOTO_EDGE = 2048;
export const MAX_IMAGE_MB = 8;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
// Eight resized photos plus room for multipart fields and boundaries.
export const MAX_UPLOAD_MB = MAX_IMAGE_MB * 8 + 1;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
