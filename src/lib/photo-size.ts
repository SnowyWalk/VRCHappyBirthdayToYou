// Read only image headers. Do not decode pixels or buffer the entire source file.
export async function readPhotoSize(file: Blob) {
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const view = new DataView(header.buffer);
  if (header.length >= 24 && header.slice(0, 8).every((byte, i) => byte === [137, 80, 78, 71, 13, 10, 26, 10][i]) && ascii(header, 12, 4) === "IHDR") {
    return dimensions(view.getUint32(16), view.getUint32(20));
  }
  if (header.length >= 25 && ascii(header, 0, 4) === "RIFF" && ascii(header, 8, 4) === "WEBP") {
    const kind = ascii(header, 12, 4);
    if (kind === "VP8X" && header.length >= 30) {
      return dimensions(1 + uint24(header, 24), 1 + uint24(header, 27));
    }
    if (kind === "VP8 " && header.length >= 30 && header[23] === 0x9d && header[24] === 1 && header[25] === 0x2a) {
      return dimensions(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    }
    if (kind === "VP8L" && header[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return dimensions(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff));
    }
  }
  if (header[0] === 0xff && header[1] === 0xd8) {
    let offset = 2;
    // Bound malformed marker chains, while skipping large metadata without reading it.
    for (let markers = 0; markers < 4096 && offset < file.size; markers++) {
      const bytes = new Uint8Array(await file.slice(offset, offset + 9).arrayBuffer());
      if (bytes.length < 2 || bytes[0] !== 0xff) break;
      const marker = bytes[1];
      if (marker === 0xff) { offset++; continue; }
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      if (bytes.length < 4) break;
      const length = bytes[2] * 256 + bytes[3];
      if (length < 2 || offset + length + 2 > file.size) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (bytes.length < 9 || length < 8) break;
        return dimensions(bytes[7] * 256 + bytes[8], bytes[5] * 256 + bytes[6]);
      }
      offset += 2 + length;
    }
  }
  throw new Error("사진의 해상도를 확인할 수 없어요. 올바른 JPG, PNG, WebP 파일을 선택해 주세요.");
}

function dimensions(width: number, height: number) {
  if (!width || !height) throw new Error("사진의 해상도를 확인할 수 없어요.");
  return { width, height };
}
function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function uint24(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}
