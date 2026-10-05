const ATLAS_SIZE = 2048;
const DATA_HEIGHT = 64;
const RECORD_LENGTH = 12;
const HEADER_LENGTH = 256;
const GUTTER = 4;

type RectKind = "L" | "P";

type TemplateRect = {
  kind: RectKind;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PhotoInput = {
  panelId: number;
  bytes: Uint8Array;
};

type DecodedPhoto = PhotoInput & {
  originalKind: RectKind;
};

export type AtlasPanelRecord = {
  panelId: number;
  active: boolean;
  portrait: boolean;
  rotatedClockwise: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AtlasBuild = {
  png: Buffer;
  header: Buffer;
  records: AtlasPanelRecord[];
};

export type AtlasRecord = AtlasPanelRecord;

export type AtlasPhotoValidation = {
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
};

const TEMPLATES: Record<number, TemplateRect[]> = {
  0: [],
  1: [{ kind: "L", x: 4, y: 68, width: 2032, height: 1143 }],
  2: [
    { kind: "P", x: 4, y: 68, width: 1008, height: 1792 },
    { kind: "P", x: 1020, y: 68, width: 1008, height: 1792 },
  ],
  3: [
    { kind: "P", x: 4, y: 68, width: 729, height: 1296 },
    { kind: "L", x: 741, y: 68, width: 1296, height: 729 },
    { kind: "L", x: 741, y: 805, width: 1296, height: 729 },
  ],
  4: [
    { kind: "L", x: 4, y: 68, width: 1248, height: 702 },
    { kind: "L", x: 714, y: 1324, width: 1248, height: 702 },
    { kind: "P", x: 4, y: 778, width: 702, height: 1248 },
    { kind: "P", x: 1260, y: 68, width: 702, height: 1248 },
  ],
  5: [
    { kind: "P", x: 4, y: 68, width: 567, height: 1008 },
    { kind: "P", x: 579, y: 68, width: 567, height: 1008 },
    { kind: "P", x: 1154, y: 68, width: 567, height: 1008 },
    { kind: "L", x: 4, y: 1084, width: 1008, height: 567 },
    { kind: "L", x: 1020, y: 1084, width: 1008, height: 567 },
  ],
  6: [
    { kind: "L", x: 4, y: 68, width: 1008, height: 567 },
    { kind: "L", x: 1020, y: 68, width: 1008, height: 567 },
    { kind: "L", x: 4, y: 643, width: 1008, height: 567 },
    { kind: "L", x: 4, y: 1218, width: 1008, height: 567 },
    { kind: "L", x: 1020, y: 643, width: 1008, height: 567 },
    { kind: "L", x: 1020, y: 1218, width: 1008, height: 567 },
  ],
  7: [
    { kind: "P", x: 4, y: 68, width: 531, height: 944 },
    { kind: "P", x: 4, y: 1020, width: 531, height: 944 },
    { kind: "P", x: 543, y: 68, width: 531, height: 944 },
    { kind: "P", x: 543, y: 1020, width: 531, height: 944 },
    { kind: "L", x: 1082, y: 68, width: 944, height: 531 },
    { kind: "L", x: 1082, y: 607, width: 944, height: 531 },
    { kind: "L", x: 1082, y: 1146, width: 944, height: 531 },
  ],
  8: [
    { kind: "L", x: 4, y: 68, width: 912, height: 513 },
    { kind: "L", x: 4, y: 589, width: 912, height: 513 },
    { kind: "L", x: 1046, y: 988, width: 912, height: 513 },
    { kind: "L", x: 1046, y: 1509, width: 912, height: 513 },
    { kind: "P", x: 4, y: 1110, width: 513, height: 912 },
    { kind: "P", x: 525, y: 1110, width: 513, height: 912 },
    { kind: "P", x: 924, y: 68, width: 513, height: 912 },
    { kind: "P", x: 1445, y: 68, width: 513, height: 912 },
  ],
};

export async function encodeAtlas(input: {
  nickname: string;
  revision: number;
  photos: PhotoInput[];
}): Promise<AtlasBuild> {
  if (
    !Number.isInteger(input.revision) ||
    input.revision < 0 ||
    input.revision > 0xffffffff
  ) {
    throw new Error("revision 값이 올바르지 않습니다.");
  }

  normalizeAtlasNickname(input.nickname);
  const photos = await decodePhotos(input.photos);
  const assignments = assignRectangles(photos);
  const records = buildRecords(assignments);
  const header = buildHeader({
    activeCount: photos.length,
    revision: input.revision,
    records,
  });
  const composites = [
    ...(await buildPhotoComposites(assignments)),
    headerToComposite(header),
  ];
  const { default: sharp } = await import("sharp");
  const png = await sharp({
    create: {
      width: ATLAS_SIZE,
      height: ATLAS_SIZE,
      channels: 4,
      background: { r: 24, g: 22, b: 28, alpha: 1 },
    },
  })
    .composite(composites)
    .png({ palette: false, compressionLevel: 9 })
    .toBuffer();

  return { png, header, records };
}

export async function validateAtlasPhoto(
  bytes: Uint8Array,
): Promise<AtlasPhotoValidation> {
  const info = await orientedImageInfo(bytes);
  if (!isExactRatio(info.width, info.height)) {
    throw new Error(
      "사진은 EXIF 방향 보정 후 정확한 16:9 또는 세로 9:16 비율이어야 합니다.",
    );
  }
  await assertDecodableImage(bytes);

  return {
    width: info.width,
    height: info.height,
    orientation: info.width > info.height ? "landscape" : "portrait",
  };
}

export function normalizeAtlasNickname(nickname: string) {
  if (/[\u0000-\u001f\u007f]/u.test(nickname)) {
    throw new Error("이름에는 제어 문자를 사용할 수 없습니다.");
  }
  const value = nickname.trim().normalize("NFC");
  if (Buffer.byteLength(value, "utf8") > 128) {
    throw new Error("이름은 UTF-8 기준 128바이트 이하로 입력해주세요.");
  }
  return value;
}

export async function decodeAtlasHeaderFromPng(bytes: Uint8Array) {
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(Buffer.from(bytes))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== ATLAS_SIZE || info.height !== ATLAS_SIZE) {
    throw new Error("BWAT PNG는 정확히 2048x2048이어야 합니다.");
  }

  const header = Buffer.alloc(HEADER_LENGTH);
  for (let bitIndex = 0; bitIndex < HEADER_LENGTH * 8; bitIndex += 1) {
    const cellX = (bitIndex % 256) * 8 + 4;
    const cellY = Math.floor(bitIndex / 256) * 8 + 4;
    const offset = (cellY * info.width + cellX) * info.channels;
    if (data[offset] >= 128) {
      header[Math.floor(bitIndex / 8)] |= 1 << (7 - (bitIndex % 8));
    }
  }

  return header;
}

async function decodePhotos(photos: PhotoInput[]): Promise<DecodedPhoto[]> {
  if (photos.length > 8) {
    throw new Error("패널은 최대 8개까지 등록할 수 있습니다.");
  }

  const seen = new Set<number>();
  const decoded = await Promise.all(
    photos.map(async (photo) => {
      if (!Number.isInteger(photo.panelId) || photo.panelId < 0 || photo.panelId > 7) {
        throw new Error("아틀라스 패널 ID가 올바르지 않습니다.");
      }
      if (seen.has(photo.panelId)) {
        throw new Error("같은 패널이 중복되었습니다.");
      }
      seen.add(photo.panelId);

      const info = await orientedImageInfo(photo.bytes);
      return {
        ...photo,
        originalKind: info.width >= info.height ? "L" : "P",
      } satisfies DecodedPhoto;
    }),
  );

  return decoded.sort((a, b) => a.panelId - b.panelId);
}

async function orientedImageInfo(bytes: Uint8Array) {
  const { default: sharp } = await import("sharp");
  try {
    const metadata = await sharp(Buffer.from(bytes), {
      animated: false,
      failOn: "warning",
      limitInputPixels: 80_000_000,
    }).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("이미지 크기를 읽을 수 없습니다.");
    }

    if ((metadata.pages ?? 1) > 1) {
      throw new Error("애니메이션 또는 다중 페이지 이미지는 사용할 수 없습니다.");
    }

    if (metadata.orientation && metadata.orientation >= 5 && metadata.orientation <= 8) {
      return { width: metadata.height, height: metadata.width };
    }

    return { width: metadata.width, height: metadata.height };
  } catch (error) {
    if (error instanceof Error && /[가-힣]/u.test(error.message)) {
      throw error;
    }

    throw new Error("이미지 파일을 읽을 수 없습니다.");
  }
}

async function assertDecodableImage(bytes: Uint8Array) {
  const { default: sharp } = await import("sharp");

  try {
    await sharp(Buffer.from(bytes), {
      animated: false,
      failOn: "warning",
      limitInputPixels: 80_000_000,
    })
      .autoOrient()
      .toColourspace("srgb")
      .raw()
      .toBuffer();
  } catch {
    throw new Error("이미지 파일을 읽을 수 없습니다.");
  }
}

function assignRectangles(photos: DecodedPhoto[]) {
  const template = TEMPLATES[photos.length];
  const remainingRects = [...template];
  const assignments: {
    photo: DecodedPhoto;
    rect: TemplateRect;
    rotatedClockwise: boolean;
  }[] = [];

  for (const photo of photos) {
    const rectIndex = remainingRects.findIndex(
      (rect) => rect.kind === photo.originalKind,
    );

    if (rectIndex === -1) {
      continue;
    }

    const [rect] = remainingRects.splice(rectIndex, 1);
    assignments.push({ photo, rect, rotatedClockwise: false });
  }

  for (const photo of photos) {
    if (assignments.some((assignment) => assignment.photo === photo)) {
      continue;
    }

    const rect = remainingRects.shift();
    if (!rect) {
      throw new Error("아틀라스 배치 사각형을 찾을 수 없습니다.");
    }

    assignments.push({
      photo,
      rect,
      rotatedClockwise: photo.originalKind !== rect.kind,
    });
  }

  return assignments.sort((a, b) => a.photo.panelId - b.photo.panelId);
}

function buildRecords(
  assignments: ReturnType<typeof assignRectangles>,
): AtlasPanelRecord[] {
  const records: AtlasPanelRecord[] = Array.from({ length: 8 }, (_, panelId) => ({
    panelId,
    active: false,
    portrait: false,
    rotatedClockwise: false,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  }));

  for (const assignment of assignments) {
    records[assignment.photo.panelId] = {
      panelId: assignment.photo.panelId,
      active: true,
      portrait: assignment.photo.originalKind === "P",
      rotatedClockwise: assignment.rotatedClockwise,
      x: assignment.rect.x,
      y: assignment.rect.y,
      width: assignment.rect.width,
      height: assignment.rect.height,
    };
  }

  return records;
}

function buildHeader(input: {
  activeCount: number;
  revision: number;
  records: AtlasPanelRecord[];
}) {
  const header = Buffer.alloc(HEADER_LENGTH);
  header.write("BWAT", 0, "ascii");
  header.writeUInt8(1, 4);
  header.writeUInt8(input.activeCount, 5);
  header.writeUInt32LE(input.revision, 8);
  header.writeUInt16LE(ATLAS_SIZE, 12);
  header.writeUInt16LE(ATLAS_SIZE, 14);
  header.writeUInt16LE(DATA_HEIGHT, 16);
  header.writeUInt16LE(RECORD_LENGTH, 18);

  for (const record of input.records) {
    const offset = 20 + record.panelId * RECORD_LENGTH;
    let flags = 0;
    if (record.active) flags |= 1;
    if (record.portrait) flags |= 2;
    if (record.rotatedClockwise) flags |= 4;

    header.writeUInt8(record.panelId, offset);
    header.writeUInt8(flags, offset + 1);
    header.writeUInt16LE(record.x, offset + 2);
    header.writeUInt16LE(record.y, offset + 4);
    header.writeUInt16LE(record.width, offset + 6);
    header.writeUInt16LE(record.height, offset + 8);
  }

  header.writeUInt32LE(crc32IsoHdlc(header.subarray(0, 252)), 252);
  return header;
}

async function buildPhotoComposites(
  assignments: ReturnType<typeof assignRectangles>,
) {
  const { default: sharp } = await import("sharp");

  return Promise.all(
    assignments.map(async ({ photo, rect, rotatedClockwise }) => {
      const targetWidth = rotatedClockwise ? rect.height : rect.width;
      const targetHeight =
        photo.originalKind === "L"
          ? Math.round((targetWidth * 9) / 16)
          : Math.round((targetWidth * 16) / 9);
      const oriented = await sharp(Buffer.from(photo.bytes), {
        failOn: "warning",
        limitInputPixels: 80_000_000,
      })
        .autoOrient()
        .resize(targetWidth, targetHeight, {
          fit: "contain",
          background: { r: 24, g: 22, b: 28, alpha: 1 },
        })
        .toColourspace("srgb")
        .flatten({ background: { r: 24, g: 22, b: 28 } })
        .removeAlpha()
        .png()
        .toBuffer();
      const { data, info } = await sharp(oriented, { limitInputPixels: 80_000_000 })
        .rotate(rotatedClockwise ? 90 : 0)
        .toColourspace("srgb")
        .ensureAlpha(1)
        .raw()
        .toBuffer({ resolveWithObject: true });

      return {
        input: addGutter(data, info.width, info.height),
        raw: {
          width: info.width + GUTTER * 2,
          height: info.height + GUTTER * 2,
          channels: 4 as const,
        },
        left: rect.x - GUTTER,
        top: rect.y - GUTTER,
      };
    }),
  );
}

function addGutter(source: Buffer, width: number, height: number) {
  const outputWidth = width + GUTTER * 2;
  const outputHeight = height + GUTTER * 2;
  const output = Buffer.alloc(outputWidth * outputHeight * 4);

  for (let y = 0; y < outputHeight; y += 1) {
    const sourceY = clamp(y - GUTTER, 0, height - 1);
    for (let x = 0; x < outputWidth; x += 1) {
      const sourceX = clamp(x - GUTTER, 0, width - 1);
      const sourceOffset = (sourceY * width + sourceX) * 4;
      const outputOffset = (y * outputWidth + x) * 4;
      output[outputOffset] = source[sourceOffset];
      output[outputOffset + 1] = source[sourceOffset + 1];
      output[outputOffset + 2] = source[sourceOffset + 2];
      output[outputOffset + 3] = 255;
    }
  }

  return output;
}

function headerToComposite(header: Buffer) {
  const data = Buffer.alloc(ATLAS_SIZE * DATA_HEIGHT * 4);

  for (let bitIndex = 0; bitIndex < HEADER_LENGTH * 8; bitIndex += 1) {
    const byte = header[Math.floor(bitIndex / 8)];
    const bit = (byte >> (7 - (bitIndex % 8))) & 1;
    const value = bit ? 255 : 0;
    const cellX = (bitIndex % 256) * 8;
    const cellY = Math.floor(bitIndex / 256) * 8;

    for (let y = cellY; y < cellY + 8; y += 1) {
      for (let x = cellX; x < cellX + 8; x += 1) {
        const offset = (y * ATLAS_SIZE + x) * 4;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    }
  }

  return {
    input: data,
    raw: { width: ATLAS_SIZE, height: DATA_HEIGHT, channels: 4 as const },
    left: 0,
    top: 0,
  };
}

function crc32IsoHdlc(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isExactRatio(width: number, height: number) {
  return (
    (width > 0 && height > 0 && width * 9 === height * 16) ||
    width * 16 === height * 9
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
