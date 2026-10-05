export const MAX_IMAGE_MB = 60;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
// Eight full-size photos plus room for multipart fields and boundaries.
export const MAX_UPLOAD_MB = MAX_IMAGE_MB * 8 + 1;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
