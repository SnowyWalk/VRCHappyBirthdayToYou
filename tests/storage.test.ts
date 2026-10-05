import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import module from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomFillSync } from "node:crypto";

type StorageModule = typeof import("../src/lib/storage");
type AtlasModule = typeof import("../src/lib/atlas");
type AlbumsRouteModule = typeof import("../src/app/api/albums/route");
type AlbumRouteModule = typeof import("../src/app/api/albums/[id]/route");
type PartyRouteModule = typeof import("../src/app/party/[hash]/atlas.png/route");

const registerHooks = (
  module as unknown as { registerHooks?: (hooks: unknown) => void }
).registerHooks;
registerHooks?.({
  resolve(
    specifier: string,
    context: { parentURL?: string },
    nextResolve: (specifier: string, context: unknown) => unknown,
  ) {
    if (specifier === "next/server") {
      return {
        shortCircuit: true,
        url:
          "data:text/javascript," +
          encodeURIComponent(
            "export class NextResponse extends Response { static json(body, init) { return Response.json(body, init); } }",
          ),
      };
    }

    if (specifier.startsWith("@/")) {
      const relativePath = specifier.slice(2).replace(/\//g, path.sep);
      const absolutePath = path.join(process.cwd(), "src", relativePath);
      const resolvedPath = path.extname(absolutePath)
        ? absolutePath
        : `${absolutePath}.ts`;
      return nextResolve(pathToFileURL(resolvedPath).href, context);
    }

    if (
      context.parentURL &&
      !context.parentURL.includes("/node_modules/") &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !path.extname(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }

    return nextResolve(specifier, context);
  },
});

const storageImportPath = "../src/lib/storage.ts";
const atlasImportPath = "../src/lib/atlas.ts";
const albumsRouteImportPath = "../src/app/api/albums/route.ts";
const albumRouteImportPath = "../src/app/api/albums/[id]/route.ts";
const partyRouteImportPath = "../src/app/party/[hash]/atlas.png/route.ts";

const storage: StorageModule = await import(storageImportPath);
const {
  createAlbum,
  cleanupExpiredStorage,
  getMedia,
  readAlbumForEdit,
  readPublicManifest,
  StorageError,
  updateAlbum,
} = storage;
const atlas: AtlasModule = await import(atlasImportPath);
const albumsRoute: AlbumsRouteModule = await import(albumsRouteImportPath);
const albumRoute: AlbumRouteModule = await import(albumRouteImportPath);
const partyRoute: PartyRouteModule = await import(partyRouteImportPath);

const { default: sharp } = await import("sharp");
const PNG_BYTES = new Uint8Array(
  await sharp({
    create: {
      width: 160,
      height: 90,
      channels: 3,
      background: { r: 200, g: 40, b: 90 },
    },
  })
    .png()
    .toBuffer(),
);
const JPEG_BYTES = new Uint8Array(
  await sharp({
    create: {
      width: 90,
      height: 160,
      channels: 3,
      background: { r: 40, g: 90, b: 200 },
    },
  })
    .jpeg()
    .toBuffer(),
);
const SQUARE_PNG_BYTES = new Uint8Array(
  await sharp({
    create: {
      width: 120,
      height: 120,
      channels: 3,
      background: { r: 80, g: 80, b: 80 },
    },
  })
    .png()
    .toBuffer(),
);
const GOLDEN_HEADER = Buffer.from(
  (
    "42 57 41 54 01 06 00 00 64 00 00 00 00 08 00 08 40 00 0c 00 00 07 fc 03 83 02 f0 03 37 02 00 00 " +
    "01 01 04 00 44 00 f0 03 37 02 00 00 02 00 00 00 00 00 00 00 00 00 00 00 03 01 fc 03 44 00 f0 03 " +
    "37 02 00 00 04 07 fc 03 c2 04 f0 03 37 02 00 00 05 00 00 00 00 00 00 00 00 00 00 00 06 01 04 00 " +
    "83 02 f0 03 37 02 00 00 07 01 04 00 c2 04 f0 03 37 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 " +
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 " +
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 " +
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 " +
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03 7a 71 4e"
  ).replace(/\s/g, ""),
  "hex",
);

test("encodes the BWAT v1 golden header into PNG data cells", async () => {
  const built = await atlas.encodeAtlas({
    nickname: "하늘 생일 축하해 ♡",
    revision: 100,
    photos: [
      { panelId: 0, bytes: JPEG_BYTES },
      { panelId: 1, bytes: PNG_BYTES },
      { panelId: 3, bytes: PNG_BYTES },
      { panelId: 4, bytes: JPEG_BYTES },
      { panelId: 6, bytes: PNG_BYTES },
      { panelId: 7, bytes: PNG_BYTES },
    ],
  });

  assert.equal(built.header.readUInt32LE(252), 0x4e717a03);
  assert.deepEqual(await recoverHeaderFromPng(built.png), GOLDEN_HEADER);
});

test("creates an album with a one-time edit token kept out of the public album", async (t) => {
  const storageDir = await useTempStorage(t);
  const { album, editToken } = await createAlbum();

  assert.match(album.id, /^[0-9a-f-]{36}$/);
  assert.equal(album.revision, 0);
  assert.equal(album.nickname, "");
  assert.equal("editTokenHash" in album, false);
  assert.equal(typeof editToken, "string");
  assert.match(album.expiresAt ?? "", /^\d{4}-\d{2}-\d{2}T/);

  const metadataPath = path.join(
    storageDir,
    "albums",
    album.id,
    "metadata.json",
  );
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  assert.equal(typeof metadata.editTokenHash, "string");
  assert.notEqual(metadata.editTokenHash, editToken);
});

test("updates an existing album, deduplicates repeated image bytes, and exposes a public manifest", async (t) => {
  const storageDir = await useTempStorage(t);
  process.env.PUBLIC_BASE_URL = "https://birthday.example";
  const { album, editToken } = await createAlbum();

  const firstSave = await updateAlbum(album.id, editToken, {
    nickname: "Mina",
    revision: 0,
    remove: [],
    images: [
      { panelId: "hero-left", bytes: PNG_BYTES },
      { panelId: "hero-right", bytes: PNG_BYTES },
    ],
  });

  assert.equal(firstSave.revision, 1);
  assert.equal(firstSave.nickname, "Mina");
  assert.equal(firstSave.panels["hero-left"], firstSave.panels["hero-right"]);
  assert.equal(firstSave.panelOrientations?.["hero-left"], "landscape");
  assert.match(firstSave.atlasId ?? "", /^[a-f0-9]{64}$/);

  const hash = firstSave.panels["hero-left"];
  assert.ok(hash);
  const mediaPath = path.join(
    storageDir,
    "albums",
    album.id,
    "media",
    `${hash}.png`,
  );
  assert.deepEqual(new Uint8Array(await readFile(mediaPath)), PNG_BYTES);

  const manifest = await readPublicManifest(album.id, "http://localhost:3000");
  assert.deepEqual(manifest, {
    schemaVersion: 1,
    id: album.id,
    nickname: "Mina",
    revision: 1,
    panels: [
      {
        id: "hero-left",
        objectName: "Hero portrait -1",
        url: `https://birthday.example/media/${album.id}/${hash}`,
      },
      {
        id: "hero-right",
        objectName: "Hero portrait 1",
        url: `https://birthday.example/media/${album.id}/${hash}`,
      },
    ],
    updatedAt: firstSave.updatedAt,
  });

  const media = await getMedia(album.id, hash);
  assert.equal(media.contentType, "image/png");
  assert.deepEqual(new Uint8Array(media.bytes), PNG_BYTES);
});

test("publishes party atlas versions and persists expiry metadata", async (t) => {
  const storageDir = await useTempStorage(t);
  process.env.PUBLIC_BASE_URL = "https://birthday.example";
  const { album, editToken } = await createAlbum();

  const first = await updateAlbum(album.id, editToken, {
    nickname: "첫 저장",
    revision: 0,
    remove: [],
    images: [{ panelId: "memory-left-0", bytes: PNG_BYTES }],
  });
  assert.match(first.atlasId ?? "", /^[a-f0-9]{64}$/);
  const firstBytes = await readFile(
    path.join(storageDir, "parties", first.atlasId!, "atlas.png"),
  );
  const firstMetadata = JSON.parse(
    await readFile(
      path.join(storageDir, "parties", first.atlasId!, "metadata.json"),
      "utf8",
    ),
  );
  assert.equal(firstMetadata.albumId, album.id);
  assert.equal(firstMetadata.revision, 1);
  assert.match(firstMetadata.headerHex, /^[a-f0-9]{512}$/);
  assert.equal(firstMetadata.header.revision, 1);
  assert.equal(firstMetadata.header.nicknameLength, 0);
  assert.match(firstMetadata.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(Buffer.from(firstMetadata.headerHex, "hex")[6], 0);
  assert.equal(firstMetadata.records.find((record: { panelId: number; active: boolean }) => record.panelId === 1)?.active, true);

  const response = await partyRoute.GET(
    new Request(`https://birthday.example/party/${first.atlasId}/atlas.png`),
    { params: Promise.resolve({ hash: first.atlasId! }) },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(
    response.headers.get("cache-control"),
    "no-store, no-transform",
  );
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array(firstBytes));

  const second = await updateAlbum(album.id, editToken, {
    nickname: "두 번째 저장",
    revision: 1,
    remove: [],
    images: [],
  });
  assert.equal(second.atlasId, first.atlasId);
  assert.equal(second.revision, 2);
  const nameUrl = storage.getAlbumDataUrl(second.id, "https://birthday.example", second.atlasId, second.nickname);
  assert.equal(new URL(nameUrl).searchParams.get("name"), "두 번째 저장");
  assert.equal(new URL(storage.getAlbumDataUrl(second.id, "https://birthday.example", second.atlasId, "")).searchParams.get("name"), "");
  const third = await updateAlbum(album.id, editToken, {
    nickname: second.nickname, revision: 2, remove: [],
    images: [{ panelId: "memory-left-0", bytes: JPEG_BYTES }],
  });
  assert.notEqual(third.atlasId, first.atlasId);
  assert.deepEqual(
    new Uint8Array(
      await readFile(
        path.join(storageDir, "parties", first.atlasId!, "atlas.png"),
      ),
    ),
    new Uint8Array(firstBytes),
  );
});

test("expires album and atlas data after the retention window and removes files", async (t) => {
  const storageDir = await useTempStorage(t);
  const { album, editToken } = await createAlbum();
  const saved = await updateAlbum(album.id, editToken, {
    nickname: "Mina",
    revision: 0,
    remove: [],
    images: [{ panelId: "hero-left", bytes: PNG_BYTES }],
  });
  const mediaHash = saved.panels["hero-left"];
  assert.ok(mediaHash);
  assert.ok(saved.atlasId);

  const albumMetadataPath = path.join(
    storageDir,
    "albums",
    album.id,
    "metadata.json",
  );
  const partyMetadataPath = path.join(
    storageDir,
    "parties",
    saved.atlasId,
    "metadata.json",
  );
  const albumMetadata = JSON.parse(await readFile(albumMetadataPath, "utf8"));
  const partyMetadata = JSON.parse(await readFile(partyMetadataPath, "utf8"));
  albumMetadata.album.expiresAt = "2000-01-01T00:00:00.000Z";
  partyMetadata.expiresAt = "2000-01-01T00:00:00.000Z";
  await writeFile(albumMetadataPath, JSON.stringify(albumMetadata, null, 2));
  await writeFile(partyMetadataPath, JSON.stringify(partyMetadata, null, 2));

  await assert.rejects(
    () => readAlbumForEdit(album.id, editToken),
    (error) => error instanceof StorageError && error.status === 410,
  );
  await assert.rejects(
    () => storage.getPartyAtlas(saved.atlasId!),
    (error) => error instanceof StorageError && error.status === 410,
  );
  await assert.rejects(
    () => getMedia(album.id, mediaHash),
    (error) => error instanceof StorageError && error.status === 410,
  );

  assert.deepEqual(await cleanupExpiredStorage(), {
    albumsDeleted: 1,
    atlasesDeleted: 1,
  });
  assert.equal(
    await storage.storagePathExists(path.join(storageDir, "albums", album.id)),
    false,
  );
  assert.equal(
    await storage.storagePathExists(
      path.join(storageDir, "parties", saved.atlasId),
    ),
    false,
  );
});

test("requires the edit token and current revision for edits", async (t) => {
  await useTempStorage(t);
  const { album, editToken } = await createAlbum();

  await assert.rejects(
    () => readAlbumForEdit(album.id, "wrong-token"),
    (error) => error instanceof StorageError && error.status === 401,
  );

  await updateAlbum(album.id, editToken, {
    nickname: "Mina",
    revision: 0,
    remove: [],
    images: [],
  });

  await assert.rejects(
    () =>
      updateAlbum(album.id, editToken, {
        nickname: "Mina",
        revision: 0,
        remove: [],
        images: [],
      }),
    (error) => error instanceof StorageError && error.status === 409,
  );
});

test("serializes concurrent saves so only one same-revision update succeeds", async (t) => {
  await useTempStorage(t);
  const { album, editToken } = await createAlbum();

  const results = await Promise.allSettled([
    updateAlbum(album.id, editToken, {
      nickname: "First",
      revision: 0,
      remove: [],
      images: [{ panelId: "hero-left", bytes: PNG_BYTES }],
    }),
    updateAlbum(album.id, editToken, {
      nickname: "Second",
      revision: 0,
      remove: [],
      images: [{ panelId: "hero-right", bytes: JPEG_BYTES }],
    }),
  ]);

  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(
    rejected[0].status === "rejected" &&
      rejected[0].reason instanceof StorageError,
  );
  assert.equal(
    rejected[0].status === "rejected" ? rejected[0].reason.status : undefined,
    409,
  );
});

test("accepts a multi-photo 4K upload above the old 65MB request limit", async (t) => {
  await useTempStorage(t);
  const { album, editToken } = await createAlbum();
  const raw = randomFillSync(Buffer.alloc(3840 * 2160 * 3));
  const photo = await sharp(raw, { raw: { width: 3840, height: 2160, channels: 3 } })
    .png({ compressionLevel: 0 }).toBuffer();
  assert.ok(photo.length > 8 * 1024 * 1024);
  assert.ok(photo.length * 3 > 65 * 1024 * 1024);
  const form = new FormData();
  form.set("nickname", "4K 사진");
  form.set("revision", "0");
  form.set("remove", "[]");
  for (const panelId of ["hero-left", "hero-right", "memory-left-0"]) {
    form.set(panelId, new Blob([new Uint8Array(photo)], { type: "image/png" }), "4k.png");
  }
  const response = await albumRoute.PUT(new Request(`http://localhost/api/albums/${album.id}`, {
    method: "PUT", headers: { authorization: `Bearer ${editToken}` }, body: form,
  }), { params: Promise.resolve({ id: album.id }) });
  assert.equal(response.status, 200);
  const saved = await readAlbumForEdit(album.id, editToken);
  const hashes = Object.values(saved.panels).filter(Boolean);
  assert.equal(hashes.length, 3);
  assert.equal(new Set(hashes).size, 1);
  const published = await storage.getPartyAtlas(saved.atlasId!);
  const info = await sharp(published.bytes).metadata();
  assert.equal(info.width, 2048);
  assert.equal(info.height, 2048);
});

test("enforces 60MB per photo and 481MB per request", async (t) => {
  await useTempStorage(t);
  const large = new Uint8Array(60 * 1024 * 1024 + 1);
  large.set(PNG_BYTES.subarray(0, 8));
  assert.equal(storage.detectImage(large.subarray(0, large.length - 1)).size, large.length - 1);
  assert.throws(() => storage.detectImage(large), error => error instanceof StorageError && error.status === 413 && error.message.includes("60MB"));
  const { album, editToken } = await createAlbum();
  const response = await albumRoute.PUT(new Request(`http://localhost/api/albums/${album.id}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${editToken}`, "content-length": String(481 * 1024 * 1024 + 1) },
    body: "too large",
  }), { params: Promise.resolve({ id: album.id }) });
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /481MB/);
  assert.equal((await readAlbumForEdit(album.id, editToken)).revision, 0);
});

test("validates panel ids, nickname length, and image magic bytes", async (t) => {
  await useTempStorage(t);
  const { album, editToken } = await createAlbum();

  await assert.rejects(
    () =>
      updateAlbum(album.id, editToken, {
        nickname: "bad\nname",
        revision: 0,
        remove: [],
        images: [],
      }),
    (error) => error instanceof StorageError && error.status === 400,
  );

  await assert.rejects(
    () =>
      updateAlbum(album.id, editToken, {
        nickname: "Mina",
        revision: 0,
        remove: [],
        images: [{ panelId: "hero-left", bytes: Uint8Array.from([1, 2, 3]) }],
      }),
    (error) => error instanceof StorageError && error.status === 415,
  );

  await assert.rejects(
    () =>
      updateAlbum(album.id, editToken, {
        nickname: "x".repeat(129),
        revision: 0,
        remove: [],
        images: [],
      }),
    (error) => error instanceof StorageError && error.status === 400,
  );

  await assert.rejects(
    () =>
      updateAlbum(album.id, editToken, {
        nickname: "Mina",
        revision: 0,
        remove: [],
        images: [{ panelId: "hero-left", bytes: SQUARE_PNG_BYTES }],
      }),
    (error) => error instanceof StorageError && error.status === 400,
  );

  const saved = await updateAlbum(album.id, editToken, {
    nickname: "Mina",
    revision: 0,
    remove: [],
    images: [{ panelId: "memory-left-0", bytes: JPEG_BYTES }],
  });
  assert.match(saved.panels["memory-left-0"] ?? "", /^[a-f0-9]{64}$/);
  assert.equal(saved.panelOrientations?.["memory-left-0"], "portrait");
});

test("rejects saves once the BWAT uint32 revision space is exhausted", async (t) => {
  const storageDir = await useTempStorage(t);
  const { album, editToken } = await createAlbum();
  const metadataPath = path.join(storageDir, "albums", album.id, "metadata.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  metadata.album.revision = 0xffffffff;
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  await assert.rejects(
    () =>
      updateAlbum(album.id, editToken, {
        nickname: "Mina",
        revision: 0xffffffff,
        remove: [],
        images: [],
      }),
    (error) => error instanceof StorageError && error.status === 400,
  );
});

test("album routes return dataUrl using PUBLIC_BASE_URL and reject malformed multipart", async (t) => {
  await useTempStorage(t);
  process.env.PUBLIC_BASE_URL = "https://birthday.example";

  const createResponse = await albumsRoute.POST(
    new Request("http://internal.example/api/albums", { method: "POST" }),
  );
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()) as Awaited<
    ReturnType<typeof createAlbum>
  > & { dataUrl: string };
  assert.equal(created.dataUrl, "");

  const editResponse = await albumRoute.GET(
    new Request(`http://internal.example/api/albums/${created.album.id}`, {
      headers: { authorization: `Bearer ${created.editToken}` },
    }),
    { params: Promise.resolve({ id: created.album.id }) },
  );
  assert.equal(editResponse.status, 200);
  const loaded = (await editResponse.json()) as { dataUrl: string };
  assert.equal(loaded.dataUrl, "");

  const formData = new FormData();
  formData.set("nickname", "Route Save");
  formData.set("revision", "0");
  formData.set("remove", "[]");
  formData.set(
    "hero-left",
    new File([PNG_BYTES], "hero.png", { type: "image/png" }),
  );
  const saveResponse = await albumRoute.PUT(
    new Request(`http://internal.example/api/albums/${created.album.id}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${created.editToken}`,
      },
      body: formData,
    }),
    { params: Promise.resolve({ id: created.album.id }) },
  );
  assert.equal(saveResponse.status, 200);
  const saved = (await saveResponse.json()) as {
    album: { atlasId: string };
    dataUrl: string;
  };
  assert.equal(
    saved.dataUrl,
    `https://birthday.example/party/${saved.album.atlasId}/atlas.png?name=Route%20Save`,
  );

  const malformedResponse = await albumRoute.PUT(
    new Request(`http://internal.example/api/albums/${created.album.id}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${created.editToken}`,
        "content-type": "multipart/form-data; boundary=missing",
      },
      body: "not a valid multipart body",
    }),
    { params: Promise.resolve({ id: created.album.id }) },
  );
  assert.equal(malformedResponse.status, 400);
});

test("album route rejects duplicate image files for the same panel", async (t) => {
  await useTempStorage(t);
  const { album, editToken } = await createAlbum();
  const formData = new FormData();
  formData.set("nickname", "Mina");
  formData.set("revision", "0");
  formData.set("remove", "[]");
  formData.append(
    "hero-left",
    new File([PNG_BYTES], "first.png", { type: "image/png" }),
  );
  formData.append(
    "hero-left",
    new File([JPEG_BYTES], "second.jpg", { type: "image/jpeg" }),
  );

  const response = await albumRoute.PUT(
    new Request(`http://localhost:3000/api/albums/${album.id}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${editToken}` },
      body: formData,
    }),
    { params: Promise.resolve({ id: album.id }) },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "같은 패널에 이미지가 여러 개 업로드되었습니다.",
  });
});

test("authenticated deletion removes original photos and all exclusive atlas versions", async (t) => {
  const dir = await useTempStorage(t);
  const { album, editToken } = await createAlbum();
  const first = await updateAlbum(album.id, editToken, { nickname: "삭제", revision: 0, remove: [], images: [{ panelId: "hero-left", bytes: PNG_BYTES }] });
  const second = await updateAlbum(album.id, editToken, { nickname: "삭제", revision: 1, remove: ["hero-left"], images: [] });
  const params = { params: Promise.resolve({ id: album.id }) };
  const denied = await albumRoute.DELETE(new Request("http://localhost/api/albums/test", { method: "DELETE", headers: { authorization: "Bearer wrong" } }), params);
  assert.equal(denied.status, 401);
  assert.equal((await readAlbumForEdit(album.id, editToken)).revision, 2);
  const response = await albumRoute.DELETE(new Request("http://localhost/api/albums/test", { method: "DELETE", headers: { authorization: `Bearer ${editToken}` } }), params);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.equal(await storage.storagePathExists(path.join(dir, "albums", album.id)), false);
  assert.equal(await storage.storagePathExists(path.join(dir, "parties", first.atlasId!)), false);
  assert.equal(await storage.storagePathExists(path.join(dir, "parties", second.atlasId!)), false);
  await assert.rejects(readAlbumForEdit(album.id, editToken), error => error instanceof StorageError && error.status === 404);
});

test("deleting shared atlas owners preserves current and old links until the last owner deletes", async (t) => {
  const dir = await useTempStorage(t);
  const first = await createAlbum();
  const second = await createAlbum();
  const old = [];
  const current = [];
  for (const owner of [first, second]) {
    old.push(await updateAlbum(owner.album.id, owner.editToken, { nickname: "공유", revision: 0, remove: [], images: [{ panelId: "hero-left", bytes: PNG_BYTES }] }));
    current.push(await updateAlbum(owner.album.id, owner.editToken, { nickname: "공유", revision: 1, remove: ["hero-left"], images: [] }));
  }
  assert.equal(old[0].atlasId, old[1].atlasId);
  assert.equal(current[0].atlasId, current[1].atlasId);
  await storage.deleteAlbum(first.album.id, first.editToken);
  assert.ok(await storage.getPartyAtlas(old[0].atlasId!));
  assert.ok(await storage.getPartyAtlas(current[0].atlasId!));
  assert.deepEqual(await storage.resolveAtlasAlbums(old[0].atlasId!), [second.album.id]);
  await storage.deleteAlbum(second.album.id, second.editToken);
  assert.equal(await storage.storagePathExists(path.join(dir, "parties", old[0].atlasId!)), false);
  assert.equal(await storage.storagePathExists(path.join(dir, "parties", current[0].atlasId!)), false);
});

test("draft and expired albums can be deleted with their edit key", async (t) => {
  const dir = await useTempStorage(t);
  const draft = await createAlbum();
  await storage.deleteAlbum(draft.album.id, draft.editToken);
  assert.equal(await storage.storagePathExists(path.join(dir, "albums", draft.album.id)), false);
  const expired = await createAlbum();
  const file = path.join(dir, "albums", expired.album.id, "metadata.json");
  const metadata = JSON.parse(await readFile(file, "utf8"));
  metadata.album.expiresAt = new Date(Date.now() - 1).toISOString();
  await writeFile(file, JSON.stringify(metadata));
  await storage.deleteAlbum(expired.album.id, expired.editToken);
  assert.equal(await storage.storagePathExists(path.join(dir, "albums", expired.album.id)), false);
});

async function useTempStorage(t: TestContext) {
  const previousStorageDir = process.env.STORAGE_DIR;
  const previousPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  const storageDir = await mkdtemp(
    path.join(os.tmpdir(), "birthday-world-storage-"),
  );
  process.env.STORAGE_DIR = storageDir;
  delete process.env.PUBLIC_BASE_URL;

  t.after(async () => {
    if (previousStorageDir === undefined) {
      delete process.env.STORAGE_DIR;
    } else {
      process.env.STORAGE_DIR = previousStorageDir;
    }

    if (previousPublicBaseUrl === undefined) {
      delete process.env.PUBLIC_BASE_URL;
    } else {
      process.env.PUBLIC_BASE_URL = previousPublicBaseUrl;
    }

    await rm(storageDir, { recursive: true, force: true });
  });

  return storageDir;
}

async function recoverHeaderFromPng(bytes: Uint8Array) {
  const { data, info } = await sharp(Buffer.from(bytes))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const header = Buffer.alloc(256);

  assert.equal(info.width, 2048);
  assert.equal(info.height, 2048);
  for (let bitIndex = 0; bitIndex < 2048; bitIndex += 1) {
    const cellX = (bitIndex % 256) * 8 + 4;
    const cellY = Math.floor(bitIndex / 256) * 8 + 4;
    const offset = (cellY * info.width + cellX) * info.channels;
    if (data[offset] >= 128) {
      header[Math.floor(bitIndex / 8)] |= 1 << (7 - (bitIndex % 8));
    }
  }

  return header;
}

test("expires access at 24 hours and removes albums and PNGs", async (t) => {
  const dir = await useTempStorage(t);
  const start = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const created = await createAlbum();
  const saved = await updateAlbum(created.album.id, created.editToken, {
    nickname: "24시간", revision: 0, remove: [],
    images: [{ panelId: "hero-left", bytes: PNG_BYTES }],
  });
  assert.equal(Date.parse(saved.expiresAt!), start + storage.RETENTION_MS);
  t.mock.timers.setTime(start + storage.RETENTION_MS - 1);
  await storage.getPartyAtlas(saved.atlasId!);
  assert.deepEqual(await storage.cleanupExpiredStorage(), { albumsDeleted: 0, atlasesDeleted: 0 });
  t.mock.timers.setTime(start + storage.RETENTION_MS);
  const requests = [
    () => readAlbumForEdit(saved.id, created.editToken),
    () => getMedia(saved.id, saved.panels["hero-left"]!),
    () => readPublicManifest(saved.id, "https://test.example"),
    () => storage.getPartyAtlas(saved.atlasId!),
    () => storage.resolveAtlasAlbums(saved.atlasId!),
    () => updateAlbum(saved.id, created.editToken, { nickname: "연장", revision: 1, remove: [], images: [] }),
  ];
  for (const request of requests) {
    await assert.rejects(request, (error: unknown) => error instanceof StorageError && error.status === 410);
  }
  const response = await partyRoute.GET(new Request("https://test.example"), { params: Promise.resolve({ hash: saved.atlasId! }) });
  assert.equal(response.status, 410);
  assert.deepEqual(await storage.cleanupExpiredStorage(), { albumsDeleted: 1, atlasesDeleted: 1 });
  assert.equal(await storage.storagePathExists(path.join(dir, "albums", saved.id)), false);
  assert.equal(await storage.storagePathExists(path.join(dir, "parties", saved.atlasId!)), false);
});

test("save renews current PNG but old PNG and unused original are cleaned up", async (t) => {
  const dir = await useTempStorage(t);
  const start = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const created = await createAlbum();
  const first = await updateAlbum(created.album.id, created.editToken, { nickname: "A", revision: 0, remove: [], images: [{ panelId: "hero-left", bytes: PNG_BYTES }] });
  t.mock.timers.setTime(start + storage.RETENTION_MS / 2);
  const second = await updateAlbum(first.id, created.editToken, { nickname: "B", revision: 1, remove: [], images: [{ panelId: "hero-left", bytes: JPEG_BYTES }] });
  assert.equal(await storage.storagePathExists(storage.getAlbumMediaPath(first.id, first.panels["hero-left"]!, "png")), false);
  const orphan = path.join(dir, "albums", first.id, "media", "failed-upload.tmp");
  await writeFile(orphan, "orphan");
  t.mock.timers.setTime(start + storage.RETENTION_MS);
  assert.deepEqual(await storage.cleanupExpiredStorage(), { albumsDeleted: 0, atlasesDeleted: 1 });
  assert.equal(await storage.storagePathExists(orphan), false);
  await storage.getPartyAtlas(second.atlasId!);
  const third = await updateAlbum(first.id, created.editToken, { nickname: "C", revision: 2, remove: [], images: [] });
  assert.equal(third.atlasId, second.atlasId);
  assert.equal(Date.parse(third.expiresAt!), start + 2 * storage.RETENTION_MS);
});

test("shared PNG survives expired owner and abandoned draft cleanup", async (t) => {
  const dir = await useTempStorage(t);
  const start = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const draft = await createAlbum();
  const a = await createAlbum();
  const b = await createAlbum();
  const input = { nickname: "Shared", revision: 0, remove: [], images: [{ panelId: "hero-left" as const, bytes: PNG_BYTES }] };
  const first = await updateAlbum(a.album.id, a.editToken, input);
  t.mock.timers.setTime(start + 1000);
  const second = await updateAlbum(b.album.id, b.editToken, input);
  assert.equal(first.atlasId, second.atlasId);
  t.mock.timers.setTime(start + storage.RETENTION_MS);
  assert.deepEqual(await storage.cleanupExpiredStorage(), { albumsDeleted: 2, atlasesDeleted: 0 });
  assert.equal(await storage.storagePathExists(path.join(dir, "albums", draft.album.id)), false);
  await storage.getPartyAtlas(second.atlasId!);
  assert.ok((await storage.resolveAtlasAlbums(second.atlasId!)).includes(b.album.id));
  t.mock.timers.setTime(start + storage.RETENTION_MS + 1000);
  assert.deepEqual(await storage.cleanupExpiredStorage(), { albumsDeleted: 1, atlasesDeleted: 1 });
});

test("legacy records use saved timestamp for retention", async (t) => {
  const dir = await useTempStorage(t);
  const created = await createAlbum();
  const saved = await updateAlbum(created.album.id, created.editToken, { nickname: "Legacy", revision: 0, remove: [], images: [] });
  const albumFile = path.join(dir, "albums", saved.id, "metadata.json");
  const partyFile = path.join(dir, "parties", saved.atlasId!, "metadata.json");
  const album = JSON.parse(await readFile(albumFile, "utf8"));
  delete album.album.expiresAt;
  album.album.updatedAt = new Date(Date.now() - storage.RETENTION_MS).toISOString();
  await writeFile(albumFile, JSON.stringify(album));
  const party = JSON.parse(await readFile(partyFile, "utf8"));
  delete party.expiresAt;
  party.createdAt = album.album.updatedAt;
  await writeFile(partyFile, JSON.stringify(party));
  assert.deepEqual(await storage.cleanupExpiredStorage(), { albumsDeleted: 1, atlasesDeleted: 1 });
});
