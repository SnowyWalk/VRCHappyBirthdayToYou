import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

const { readPhotoSize } = await import(new URL("../src/lib/photo-size.ts", import.meta.url).href) as typeof import("../src/lib/photo-size");

test("reads PNG, JPEG and all WebP headers without decoding pixels", async () => {
  const source = () => sharp({ create: { width: 160, height: 90, channels: 3, background: "#775533" } });
  const files = [
    await source().png().toBuffer(),
    await source().jpeg().toBuffer(),
    await source().jpeg({ progressive: true }).withMetadata({ orientation: 6 }).toBuffer(),
    await source().webp().toBuffer(),
    await source().webp({ lossless: true }).toBuffer(),
    await source().webp().withMetadata().toBuffer(),
  ];
  for (const bytes of files) {
    assert.deepEqual(await readPhotoSize(new Blob([new Uint8Array(bytes)])), { width: 160, height: 90 });
  }
});

test("skips JPEG metadata and reads only small header slices", async () => {
  const jpeg = await sharp({ create: { width: 90, height: 160, channels: 3, background: "red" } }).jpeg().toBuffer();
  const metadata = Buffer.alloc(65535);
  metadata.set([0xff, 0xe1, 0xff, 0xfd]);
  const blob = new Blob([new Uint8Array(jpeg.subarray(0, 2)), new Uint8Array(metadata), new Uint8Array(jpeg.subarray(2))]);
  let bytesRead = 0;
  const slice = blob.slice.bind(blob);
  blob.slice = (start, end, contentType) => {
    const part = slice(start, end, contentType);
    bytesRead += part.size;
    return part;
  };
  assert.deepEqual(await readPhotoSize(blob), { width: 90, height: 160 });
  assert.ok(bytesRead < 1024);
});

test("rejects truncated, malformed and zero-dimension headers", async () => {
  for (const bytes of [new Uint8Array(), new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 1]), new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 100])]) {
    await assert.rejects(readPhotoSize(new Blob([bytes])), /해상도를 확인/);
  }
  const png = await sharp({ create: { width: 160, height: 90, channels: 3, background: "red" } }).png().toBuffer();
  png.writeUInt32BE(0, 16);
  await assert.rejects(readPhotoSize(new Blob([new Uint8Array(png)])), /해상도를 확인/);
});
