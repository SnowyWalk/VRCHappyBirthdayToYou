import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  encodeAtlas,
  validateAtlasPhoto,
  type AtlasPanelRecord,
} from "./atlas";
import { PANELS, type Album, type PanelId } from "./panels";

import { MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "./upload-limits";
const MAX_NICKNAME_BYTES = 128;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH_RE = /^[a-f0-9]{64}$/;

export class StorageError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ImageMeta = {
  contentType: "image/png" | "image/jpeg" | "image/webp";
  ext: "png" | "jpg" | "webp";
  size: number;
  orientation?: "landscape" | "portrait";
};

type AlbumWithAtlas = Album & {
  atlasId?: string;
  panelOrientations?: Partial<Record<PanelId, "landscape" | "portrait">>;
};

type StoredAlbum = {
  album: AlbumWithAtlas;
  editTokenHash: string;
  media: Record<string, ImageMeta>;
};

export type PublishedAtlas = {
  atlasId: string;
  header: Buffer;
  records: AtlasPanelRecord[];
  panelOrientations: Partial<Record<PanelId, "landscape" | "portrait">>;
};

export type PublicPanel = {
  id: PanelId;
  objectName: string;
  url: string;
};

export type PublicManifest = {
  schemaVersion: 1;
  id: string;
  nickname: string;
  revision: number;
  /**
   * Only populated panels are emitted. Empty panels are intentionally omitted
   * so the VRChat world can keep those slots untouched/blank.
   */
  panels: PublicPanel[];
  updatedAt: string;
};

export type ImageInput = {
  panelId: PanelId;
  bytes: Uint8Array;
};

const panelIds = new Set<string>(PANELS.map((panel) => panel.id));
const writeQueues = new Map<string, Promise<unknown>>();

export function getStorageRoot() {
  return path.resolve(process.env.STORAGE_DIR ?? "./storage");
}

export function assertAlbumId(id: string) {
  if (!UUID_RE.test(id)) {
    throw new StorageError(400, "앨범 ID가 올바르지 않습니다.");
  }
}

export function assertHash(hash: string) {
  if (!HASH_RE.test(hash)) {
    throw new StorageError(400, "이미지 해시가 올바르지 않습니다.");
  }
}

export function isPanelId(value: string): value is PanelId {
  return panelIds.has(value);
}

export function getAlbumMediaPath(id: string, hash: string, ext: string) {
  assertAlbumId(id);
  assertHash(hash);
  if (!["png", "jpg", "webp"].includes(ext)) {
    throw new StorageError(400, "이미지 확장자가 올바르지 않습니다.");
  }

  return path.join(getAlbumDir(id), "media", `${hash}.${ext}`);
}

export async function createAlbum() {
  const id = randomUUID();
  const editToken = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const album: AlbumWithAtlas = {
    id,
    nickname: "",
    revision: 0,
    createdAt: now,
    updatedAt: now,
    panels: emptyPanels(),
  };

  const stored: StoredAlbum = {
    album,
    editTokenHash: sha256String(editToken),
    media: {},
  };

  await mkdir(path.join(getAlbumDir(id), "media"), { recursive: true });
  await writeStoredAlbum(id, stored);

  return { album, editToken };
}

export async function readAlbumForEdit(id: string, token: string) {
  const stored = await readStoredAlbum(id);
  verifyToken(stored, token);
  return stored.album;
}

export async function updateAlbum(
  id: string,
  token: string,
  input: {
    nickname: string;
    revision: number;
    remove: PanelId[];
    images: ImageInput[];
  },
) {
  return withAlbumWriteLock(id, async () => {
    const stored = await readStoredAlbum(id);
    verifyToken(stored, token);

    if (stored.album.revision !== input.revision) {
      throw new StorageError(
        409,
        "저장된 내용이 이미 변경되었습니다. 다시 불러온 뒤 저장해주세요.",
      );
    }

    const nickname = normalizeNickname(input.nickname);
    const panels = { ...stored.album.panels };

    for (const panelId of input.remove) {
      panels[panelId] = null;
    }

    const media = { ...stored.media };
    for (const image of input.images) {
      if (!isPanelId(image.panelId)) {
        throw new StorageError(400, "알 수 없는 패널입니다.");
      }

      const detected = await validateNewImage(image.bytes);
      const hash = sha256Bytes(image.bytes);
      const mediaPath = getAlbumMediaPath(id, hash, detected.ext);

      if (!media[hash]) {
        await mkdir(path.dirname(mediaPath), { recursive: true });
        await writeFileAtomic(mediaPath, Buffer.from(image.bytes));
        media[hash] = { ...detected, size: image.bytes.byteLength };
      }

      panels[image.panelId] = hash;
    }

    const nextRevision = stored.album.revision + 1;
    if (nextRevision > 0xffffffff) {
      throw new StorageError(400, "revision 값이 BWAT uint32 범위를 초과했습니다.");
    }
    const photosUnchanged = PANELS.every(panel => panels[panel.id] === stored.album.panels[panel.id]);
    const published = photosUnchanged && stored.album.atlasId
      ? { atlasId: stored.album.atlasId, panelOrientations: stored.album.panelOrientations ?? getPanelOrientations(panels, media) }
      : await publishAtlas(
      id,
      nickname,
      nextRevision,
      panels,
      media,
    );
    const now = new Date().toISOString();
    const nextStored: StoredAlbum = {
      ...stored,
      album: {
        ...stored.album,
        nickname,
        panels,
        panelOrientations:
          published.panelOrientations || getPanelOrientations(panels, media),
        revision: nextRevision,
        updatedAt: now,
        atlasId: published.atlasId,
      },
      media,
    };

    await writeStoredAlbum(id, nextStored);
    return nextStored.album;
  });
}

export async function readPublicManifest(id: string, origin: string) {
  const stored = await readStoredAlbum(id);
  const baseUrl = getPublicBaseUrl(origin);
  const panels: PublicPanel[] = [];

  for (const panel of PANELS) {
    const hash = stored.album.panels[panel.id];
    if (!hash) {
      continue;
    }

    panels.push({
      id: panel.id,
      objectName: panel.objectName,
      url: `${baseUrl}/media/${stored.album.id}/${hash}`,
    });
  }

  return {
    schemaVersion: 1,
    id: stored.album.id,
    nickname: stored.album.nickname,
    revision: stored.album.revision,
    panels,
    updatedAt: stored.album.updatedAt,
  } satisfies PublicManifest;
}

export function getAlbumDataUrl(
  id: string,
  origin: string,
  atlasId?: string,
  nickname = "",
) {
  assertAlbumId(id);
  if (!atlasId) {
    return "";
  }
  assertHash(atlasId);
  const base = `${getPublicBaseUrl(origin)}/party/${atlasId}/atlas.png`;
  const normalized = normalizeNickname(nickname);
  return `${base}?name=${encodeURIComponent(normalized)}`;
}

export async function getMedia(id: string, hash: string) {
  assertAlbumId(id);
  assertHash(hash);
  const stored = await readStoredAlbum(id);
  const image = stored.media[hash];
  if (!image) {
    throw new StorageError(404, "이미지를 찾을 수 없습니다.");
  }

  const mediaPath = getAlbumMediaPath(id, hash, image.ext);
  const bytes = await readFile(mediaPath).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        throw new StorageError(404, "이미지 파일을 찾을 수 없습니다.");
      }
      throw error;
    },
  );

  return { bytes, contentType: image.contentType };
}

export async function getPartyAtlas(hash: string) {
  assertHash(hash);
  const bytes = await readFile(getPartyAtlasPath(hash)).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        throw new StorageError(404, "아틀라스를 찾을 수 없습니다.");
      }
      throw error;
    },
  );

  return { bytes, contentType: "image/png" as const };
}

export function normalizeNickname(nickname: string) {
  if (/[\u0000-\u001f\u007f]/u.test(nickname)) {
    throw new StorageError(400, "이름에는 제어 문자를 사용할 수 없습니다.");
  }

  const value = nickname.trim().normalize("NFC");
  if (Buffer.byteLength(value, "utf8") > MAX_NICKNAME_BYTES) {
    throw new StorageError(400, "이름은 UTF-8 기준 128바이트 이하로 입력해주세요.");
  }
  return value;
}

export function detectImage(bytes: Uint8Array): ImageMeta {
  if (bytes.byteLength === 0) {
    throw new StorageError(400, "비어있는 이미지입니다.");
  }

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new StorageError(
      413,
      `이미지는 파일당 ${MAX_IMAGE_MB}MB 이하만 업로드할 수 있습니다.`,
    );
  }

  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", ext: "png", size: bytes.byteLength };
  }

  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: "image/jpeg", ext: "jpg", size: bytes.byteLength };
  }

  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { contentType: "image/webp", ext: "webp", size: bytes.byteLength };
  }

  throw new StorageError(415, "PNG, JPEG, WEBP 이미지만 업로드할 수 있습니다.");
}

export async function validateNewImage(bytes: Uint8Array): Promise<ImageMeta> {
  const image = detectImage(bytes);
  try {
    const validated = await validateAtlasPhoto(bytes);
    const orientation =
      validated.orientation === "portrait" ? "portrait" : "landscape";
    return {
      ...image,
      orientation,
    };
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError(400, "이미지 파일을 읽을 수 없습니다.");
  }
}

async function readStoredAlbum(id: string): Promise<StoredAlbum> {
  assertAlbumId(id);
  const filePath = getAlbumFilePath(id);
  const raw = await readFile(filePath, "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        throw new StorageError(404, "앨범을 찾을 수 없습니다.");
      }
      throw error;
    },
  );

  return JSON.parse(raw) as StoredAlbum;
}

async function writeStoredAlbum(id: string, stored: StoredAlbum) {
  assertAlbumId(id);
  await mkdir(getAlbumDir(id), { recursive: true });
  await writeFileAtomic(
    getAlbumFilePath(id),
    Buffer.from(JSON.stringify(stored, null, 2)),
  );
}

async function writeFileAtomic(filePath: string, bytes: Buffer) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tempPath = path.join(
    dir,
    `.tmp-${process.pid}-${Date.now()}-${randomBytes(6).toString("hex")}`,
  );
  await writeFile(tempPath, bytes);
  await rename(tempPath, filePath);
}

async function withAlbumWriteLock<T>(id: string, task: () => Promise<T>) {
  assertAlbumId(id);
  const previous = writeQueues.get(id) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.then(
    () => current,
    () => current,
  );
  writeQueues.set(id, next);

  try {
    await previous.catch(() => undefined);
    return await task();
  } finally {
    release();
    if (writeQueues.get(id) === next) {
      writeQueues.delete(id);
    }
  }
}

function emptyPanels() {
  return Object.fromEntries(PANELS.map((panel) => [panel.id, null])) as Record<
    PanelId,
    string | null
  >;
}

function verifyToken(stored: StoredAlbum, token: string) {
  const actual = Buffer.from(sha256String(token), "hex");
  const expected = Buffer.from(stored.editTokenHash, "hex");

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new StorageError(401, "편집 권한이 없습니다.");
  }
}

function getAlbumDir(id: string) {
  return path.join(getStorageRoot(), "albums", id);
}

function getAlbumFilePath(id: string) {
  return path.join(getAlbumDir(id), "metadata.json");
}

function getPartyDir(hash: string) {
  assertHash(hash);
  return path.join(getStorageRoot(), "parties", hash);
}

function getPartyAtlasPath(hash: string) {
  return path.join(getPartyDir(hash), "atlas.png");
}

function getPartyMetadataPath(hash: string) {
  return path.join(getPartyDir(hash), "metadata.json");
}

export async function resolveAtlasAlbums(hash: string): Promise<string[]> {
  assertHash(hash);
  const raw = await readFile(getPartyMetadataPath(hash), "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") throw new StorageError(404, "저장된 이미지 링크를 찾을 수 없어요.");
      throw error;
    },
  );
  const metadata = JSON.parse(raw) as { albumId: string };
  const ids = new Set<string>([metadata.albumId]);
  // Identical PNGs can be shared by multiple albums. Include all current owners.
  const albums = await readdir(path.join(getStorageRoot(), "albums"), { withFileTypes: true });
  for (const entry of albums) {
    if (!entry.isDirectory() || !UUID_RE.test(entry.name)) continue;
    const stored = await readStoredAlbum(entry.name);
    if (stored.album.atlasId === hash) ids.add(stored.album.id);
  }
  return [...ids];
}

export function getPublicBaseUrl(origin: string) {
  return (process.env.PUBLIC_BASE_URL || origin).replace(/\/+$/, "");
}

function sha256String(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Bytes(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasPrefix(bytes: Uint8Array, prefix: number[]) {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function getPanelAtlasId(panelId: PanelId) {
  return PANELS.find((entry) => entry.id === panelId)!.atlasId;
}

function getPanelOrientations(
  panels: Record<PanelId, string | null>,
  media: Record<string, ImageMeta>,
) {
  return Object.fromEntries(
    PANELS.flatMap((panel) => {
      const hash = panels[panel.id];
      const orientation = hash ? media[hash]?.orientation : undefined;
      return orientation ? [[panel.id, orientation]] : [];
    }),
  ) as Partial<Record<PanelId, "landscape" | "portrait">>;
}

function getPanelOrientationsFromRecords(records: AtlasPanelRecord[]) {
  return Object.fromEntries(
    records.flatMap((record) => {
      if (!record.active) {
        return [];
      }

      const panel = PANELS.find(
        (entry) => getPanelAtlasId(entry.id) === record.panelId,
      );
      if (!panel) {
        return [];
      }

      return [[panel.id, record.portrait ? "portrait" : "landscape"]];
    }),
  ) as Partial<Record<PanelId, "landscape" | "portrait">>;
}

async function publishAtlas(
  albumId: string,
  nickname: string,
  revision: number,
  panels: Record<PanelId, string | null>,
  media: Record<string, ImageMeta>,
): Promise<PublishedAtlas> {
  const photos = await Promise.all(
    PANELS.flatMap((panel) => {
      const hash = panels[panel.id];
      if (!hash) {
        return [];
      }
      const image = media[hash];
      if (!image) {
        throw new StorageError(500, "사진 메타데이터가 손상되었습니다.");
      }

      return [
        readFile(getAlbumMediaPath(albumId, hash, image.ext)).then((bytes) => ({
          panelId: getPanelAtlasId(panel.id),
          bytes: new Uint8Array(bytes),
        })),
      ];
    }),
  );

  // The VRChat world reads the display name from the copied URL's ?name=
  // parameter. Keep the immutable PNG independent from nickname text.
  const atlas = await encodeAtlas({ nickname: "", revision, photos });
  const atlasId = sha256Bytes(atlas.png);
  const partyDir = getPartyDir(atlasId);
  await mkdir(partyDir, { recursive: true });

  if (!(await storagePathExists(getPartyAtlasPath(atlasId)))) {
    await writeFileAtomic(getPartyAtlasPath(atlasId), Buffer.from(atlas.png));
  }

  if (!(await storagePathExists(getPartyMetadataPath(atlasId)))) {
    await writeFileAtomic(
      getPartyMetadataPath(atlasId),
      Buffer.from(
        JSON.stringify(
          {
            albumId,
            revision,
            headerHex: Buffer.from(atlas.header).toString("hex"),
            header: {
              activeCount: atlas.records.filter((record) => record.active)
                .length,
              nicknameLength: 0,
              revision,
              crc32: Buffer.from(atlas.header).readUInt32LE(252),
            },
            records: atlas.records,
            createdAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      ),
    );
  }

  return {
    atlasId,
    header: atlas.header,
    records: atlas.records,
    panelOrientations: getPanelOrientationsFromRecords(atlas.records),
  };
}

export async function storagePathExists(filePath: string) {
  return stat(filePath)
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return false;
      }
      throw error;
    });
}
