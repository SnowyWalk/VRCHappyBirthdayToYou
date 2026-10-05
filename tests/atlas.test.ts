import assert from "node:assert/strict";
import module from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

type AtlasModule = typeof import("../src/lib/atlas");
type AtlasPanelRecord = import("../src/lib/atlas").AtlasPanelRecord;

const registerHooks = (
  module as unknown as { registerHooks?: (hooks: unknown) => void }
).registerHooks;
registerHooks?.({
  resolve(
    specifier: string,
    context: { parentURL?: string },
    nextResolve: (specifier: string, context: unknown) => unknown,
  ) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !path.extname(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const {
  decodeAtlasHeaderFromPng,
  encodeAtlas,
  normalizeAtlasNickname,
  validateAtlasPhoto,
}: AtlasModule = await import(
  pathToFileURL(path.join(process.cwd(), "src", "lib", "atlas.ts")).href
);

const GOLDEN_HEADER_HEX = `
42 57 41 54 01 06 00 00 64 00 00 00 00 08 00 08 40 00 0c 00 00 07 fc 03 83 02 f0 03 37 02 00 00
01 01 04 00 44 00 f0 03 37 02 00 00 02 00 00 00 00 00 00 00 00 00 00 00 03 01 fc 03 44 00 f0 03
37 02 00 00 04 07 fc 03 c2 04 f0 03 37 02 00 00 05 00 00 00 00 00 00 00 00 00 00 00 06 01 04 00
83 02 f0 03 37 02 00 00 07 01 04 00 c2 04 f0 03 37 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03 7a 71 4e
`;

test("encodes the BWAT v1 golden header vector", async () => {
  const landscape = await makePanelPhoto(160, 90);
  const portrait = await makePanelPhoto(90, 160);
  const { header, records } = await encodeAtlas({
    nickname: "하늘 생일 축하해 ♡",
    revision: 100,
    photos: [
      { panelId: 0, bytes: portrait },
      { panelId: 1, bytes: landscape },
      { panelId: 3, bytes: landscape },
      { panelId: 4, bytes: portrait },
      { panelId: 6, bytes: landscape },
      { panelId: 7, bytes: landscape },
    ],
  });

  assert.equal(Buffer.from(compactHex(GOLDEN_HEADER_HEX), "hex").length, 256);
  assert.equal(header.toString("hex"), compactHex(GOLDEN_HEADER_HEX));
  assert.equal(header.readUInt32LE(252), 0x4e717a03);
  assert.deepEqual(
    activeRecords(records).map(({ panelId, portrait, rotatedClockwise, x, y }) => ({
      panelId,
      portrait,
      rotatedClockwise,
      x,
      y,
    })),
    [
      { panelId: 0, portrait: true, rotatedClockwise: true, x: 1020, y: 643 },
      { panelId: 1, portrait: false, rotatedClockwise: false, x: 4, y: 68 },
      { panelId: 3, portrait: false, rotatedClockwise: false, x: 1020, y: 68 },
      { panelId: 4, portrait: true, rotatedClockwise: true, x: 1020, y: 1218 },
      { panelId: 6, portrait: false, rotatedClockwise: false, x: 4, y: 643 },
      { panelId: 7, portrait: false, rotatedClockwise: false, x: 4, y: 1218 },
    ],
  );
});

test("writes a lossless 2048-bit header grid into the top 64 PNG pixels", async () => {
  const { png, header } = await encodeAtlas({
    nickname: "Mina",
    revision: 7,
    photos: [
      { panelId: 2, bytes: await makePanelPhoto(160, 90) },
      { panelId: 5, bytes: await makePanelPhoto(90, 160) },
    ],
  });

  const restored = await decodeAtlasHeaderFromPng(png);
  const metadata = await sharp(png).metadata();

  assert.equal(metadata.width, 2048);
  assert.equal(metadata.height, 2048);
  assert.equal(metadata.space, "srgb");
  assert.deepEqual(restored, header);
});

test("stores portrait photos clockwise and recovers original corner order", async () => {
  const portrait = await makeCornerPhoto(1143, 2032);
  const { png, records } = await encodeAtlas({
    nickname: "Corners",
    revision: 1,
    photos: [{ panelId: 0, bytes: portrait }],
  });
  const record = records[0];

  assert.equal(record.rotatedClockwise, true);
  assert.equal(record.portrait, true);
  assert.equal(record.width, 2032);
  assert.equal(record.height, 1143);

  const recovered = await sharp(png)
    .extract({
      left: record.x,
      top: record.y,
      width: record.width,
      height: record.height,
    })
    .rotate(-90)
    .raw()
    .toBuffer({ resolveWithObject: true });

  assertPixelNear(recovered, 0, 0, [255, 0, 0]);
  assertPixelNear(recovered, recovered.info.width - 1, 0, [0, 255, 0]);
  assertPixelNear(recovered, 0, recovered.info.height - 1, [0, 0, 255]);
  assertPixelNear(recovered, recovered.info.width - 1, recovered.info.height - 1, [255, 255, 0]);
});

test("prefers matching rectangles before rotating leftover photos", async () => {
  const landscape = await makePanelPhoto(160, 90);
  const { records } = await encodeAtlas({
    nickname: "Three",
    revision: 3,
    photos: [
      { panelId: 0, bytes: landscape },
      { panelId: 1, bytes: landscape },
      { panelId: 2, bytes: landscape },
    ],
  });

  assert.deepEqual(
    activeRecords(records).map((record) => ({
      panelId: record.panelId,
      width: record.width,
      height: record.height,
      rotatedClockwise: record.rotatedClockwise,
    })),
    [
      { panelId: 0, width: 1296, height: 729, rotatedClockwise: false },
      { panelId: 1, width: 1296, height: 729, rotatedClockwise: false },
      { panelId: 2, width: 729, height: 1296, rotatedClockwise: true },
    ],
  );
});

test("covers every BWAT template count with bounded non-overlapping records", async () => {
  const landscape = await makePanelPhoto(160, 90);
  const portrait = await makePanelPhoto(90, 160);
  const expectedK = [0, 127, 112, 81, 78, 63, 63, 59, 57];

  for (let count = 0; count <= 8; count += 1) {
    const { header, records } = await encodeAtlas({
      nickname: `Count ${count}`,
      revision: count,
      photos: Array.from({ length: count }, (_, panelId) => ({
        panelId,
        bytes: panelId % 2 === 0 ? landscape : portrait,
      })),
    });
    const active = activeRecords(records);

    assert.equal(header[5], count);
    assert.equal(active.length, count);

    for (const record of active) {
      assert.ok(record.x >= 4);
      assert.ok(record.y >= 68);
      assert.ok(record.x + record.width + 4 <= 2048);
      assert.ok(record.y + record.height + 4 <= 2048);

      if (record.width > record.height) {
        assert.equal(record.width / 16, expectedK[count]);
        assert.equal(record.height / 9, expectedK[count]);
      } else {
        assert.equal(record.width / 9, expectedK[count]);
        assert.equal(record.height / 16, expectedK[count]);
      }
    }

    for (let left = 0; left < active.length; left += 1) {
      for (let right = left + 1; right < active.length; right += 1) {
        assert.equal(gutterOverlaps(active[left], active[right]), false);
      }
    }
  }
});

test("letterboxes legacy non-ratio grayscale photos instead of stretching them", async () => {
  const square = await sharp({
    create: {
      width: 120,
      height: 120,
      channels: 3,
      background: "#ffffff",
    },
  })
    .grayscale()
    .png()
    .toBuffer();
  const { png, records } = await encodeAtlas({
    nickname: "Legacy",
    revision: 2,
    photos: [{ panelId: 0, bytes: square }],
  });
  const record = records[0];
  const raw = await sharp(png)
    .extract({
      left: record.x,
      top: record.y,
      width: record.width,
      height: record.height,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  assert.equal(record.width, 2032);
  assert.equal(record.height, 1143);
  assertPixelNear(raw, 8, Math.floor(record.height / 2), [24, 22, 28]);
  assertPixelNear(
    raw,
    Math.floor(record.width / 2),
    Math.floor(record.height / 2),
    [255, 255, 255],
  );
});

test("validates upload photos with EXIF orientation before ratio checks", async () => {
  const landscapeViaExif = await sharp({
    create: {
      width: 90,
      height: 160,
      channels: 3,
      background: "#6699cc",
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

  const square = await makePanelPhoto(100, 100);
  await assert.rejects(() => validateAtlasPhoto(square), /16:9 또는 세로 9:16/);
  assert.deepEqual(await validateAtlasPhoto(landscapeViaExif), {
    width: 160,
    height: 90,
    orientation: "landscape",
  });
  await assert.rejects(
    () => validateAtlasPhoto(new Uint8Array([0xff, 0xd8, 0xff, 0x00])),
    /이미지 파일을 읽을 수 없습니다/,
  );
});

test("normalizes nickname text and rejects unsafe header fields", async () => {
  assert.equal(normalizeAtlasNickname("e\u0301"), "é");
  assert.throws(() => normalizeAtlasNickname(`bad\nname`), /제어 문자/);
  assert.throws(() => normalizeAtlasNickname("가".repeat(43)), /128바이트/);

  await assert.rejects(
    () =>
      encodeAtlas({
        nickname: "Mina",
        revision: -1,
        photos: [],
      }),
    /revision/,
  );
  await assert.rejects(
    () =>
      encodeAtlas({
        nickname: "Mina",
        revision: 1,
        photos: [
          { panelId: 0, bytes: new Uint8Array([1, 2, 3]) },
          { panelId: 0, bytes: new Uint8Array([4, 5, 6]) },
        ],
      }),
    /같은 패널/,
  );
});

function compactHex(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function activeRecords(records: AtlasPanelRecord[]) {
  return records.filter((record) => record.active);
}

function gutterOverlaps(left: AtlasPanelRecord, right: AtlasPanelRecord) {
  return !(
    left.x + left.width + 4 <= right.x - 4 ||
    right.x + right.width + 4 <= left.x - 4 ||
    left.y + left.height + 4 <= right.y - 4 ||
    right.y + right.height + 4 <= left.y - 4
  );
}

async function makePanelPhoto(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#88aadd",
    },
  })
    .png()
    .toBuffer();
}

async function makeCornerPhoto(width: number, height: number) {
  const halfWidth = Math.floor(width / 2);
  const halfHeight = Math.floor(height / 2);

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#000000",
    },
  })
    .composite([
      await colorRect("#ff0000", halfWidth, halfHeight, 0, 0),
      await colorRect("#00ff00", width - halfWidth, halfHeight, halfWidth, 0),
      await colorRect("#0000ff", halfWidth, height - halfHeight, 0, halfHeight),
      await colorRect("#ffff00", width - halfWidth, height - halfHeight, halfWidth, halfHeight),
    ])
    .png()
    .toBuffer();
}

async function colorRect(
  color: string,
  width: number,
  height: number,
  left: number,
  top: number,
) {
  return {
    input: await sharp({
      create: { width, height, channels: 3, background: color },
    })
      .png()
      .toBuffer(),
    left,
    top,
  };
}

function assertPixelNear(
  image: { data: Buffer; info: { width: number; channels: number } },
  x: number,
  y: number,
  expected: [number, number, number],
) {
  const index = (y * image.info.width + x) * image.info.channels;
  const actual = [
    image.data[index],
    image.data[index + 1],
    image.data[index + 2],
  ];

  for (let channel = 0; channel < 3; channel += 1) {
    assert.ok(
      Math.abs(actual[channel] - expected[channel]) <= 1,
      `pixel ${x},${y} channel ${channel}: expected ${expected[channel]}, got ${actual[channel]}`,
    );
  }
}
