import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import {
  chooseFile,
  copyButton,
  editIdFrom,
  expectNoHorizontalOverflow,
  landscapeImage,
  makeImage,
  actionBar,
  linkCard,
  linkField,
  makeLink,
  makeLinkButton,
  nameField,
  panel,
  portraitImage,
  squareImage,
  status,
  type TestImage,
} from "./helpers";

test("one screen: name, photos and link without creating an album before saving", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(nameField(page)).toBeVisible();
  await expect(page.locator(".panel")).toHaveCount(8);
  await expect(makeLinkButton(page)).toBeVisible();
  await expect(status(page)).toHaveText("이름과 사진을 정하세요");
  expect(new URL(page.url()).pathname).toBe("/");

  // The stage sign preview follows the typed name.
  await nameField(page).fill("나쁜\u0001이름");
  await makeLinkButton(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "제어 문자" })).toBeVisible();
  await expect(nameField(page)).toBeFocused();
  expect(new URL(page.url()).pathname).toBe("/");
  await nameField(page).fill("테스트 생일");
  await expect(page.locator(".name-sign-text")).toHaveText("테스트 생일");

  await chooseFile(page, panel(page, "hero-left"));
  await expect(panel(page, "hero-left")).toHaveClass(/filled/);
  await expect(page.locator(".count")).toContainText("1");
  await expect(status(page)).toHaveText("사진 1장 준비됨");
  const firstLink = await makeLink(page);
  const id = editIdFrom(page);
  expect(page.url()).toMatch(new RegExp(`/edit/${id}#key=[\\w-]{43}$`));
  expect(new URL(firstLink).searchParams.get("name")).toBe("테스트 생일");
  expect((await request.get(firstLink)).status()).toBe(200);
  // Making the link copies nothing: the copy button starts unpressed and the
  // link part, with the world board guide, is scrolled into view instead.
  await expect(copyButton(page)).toHaveText("링크 복사");
  await expect(copyButton(page)).toBeFocused();
  await expect(copyButton(page)).toBeInViewport();
  await expect(actionBar(page)).toBeHidden();
  const guide = linkCard(page).getByRole("img", { name: /생일 사진 설정 판/ });
  await expect(guide).toBeVisible();
  await expect.poll(() => guide.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(linkCard(page)).toContainText("① 여기에 붙여넣기");
  await expect(linkCard(page)).toContainText("24시간");
  await page.screenshot({ path: "artifacts/screenshots/link-desktop.png" });

  // Editing marks the link stale until a new one is made.
  await nameField(page).fill("테스트 생일 수정");
  await expect(status(page)).toHaveText("바뀐 내용이 있어요");
  await expect(makeLinkButton(page)).toHaveText("새 링크 만들기");
  const secondLink = await makeLink(page);
  expect(new URL(secondLink).pathname).toBe(new URL(firstLink).pathname);
  expect(new URL(secondLink).searchParams.get("name")).toBe("테스트 생일 수정");
  await page.screenshot({ path: "artifacts/screenshots/studio-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".slot")).toHaveCount(8);
  for (const slot of await page.locator(".slot").all()) {
    const bounds = (await slot.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  // Away from part 3 the bar offers the same action, inside the screen.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(actionBar(page)).toBeVisible();
  await expect.poll(async () => { const bar = (await actionBar(page).boundingBox())!; return bar.y + bar.height; }).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "artifacts/screenshots/studio-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "테마 전환", exact: true }).click();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: "artifacts/screenshots/studio-mobile-theme.png", fullPage: true });
  expect(errors).toEqual([]);
  await request.delete(`/api/albums/${id}`, { headers: { Authorization: `Bearer ${new URL(page.url()).hash.slice(5)}` } });
});

test("accepts an 8K source over 60MB and rejects excess pixels before decoding", async ({ page, request }, testInfo) => {
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      const root = document.documentElement;
      root.dataset.photoDecodes = String(Number(root.dataset.photoDecodes || 0) + 1);
      return decode.call(this);
    };
  });
  const { album, editToken } = await (await request.post("/api/albums")).json();
  const largePath = testInfo.outputPath("large-8k.png");
  try {
    await page.goto(`/edit/${album.id}#key=${editToken}`);
    const large = await sharp({ create: { width: 7680, height: 4320, channels: 3, background: "#3e9abc" } }).png({ compressionLevel: 0 }).toBuffer();
    expect(large.length).toBeGreaterThan(60 * 1024 * 1024);
    await writeFile(largePath, large);
    await chooseFile(page, panel(page, "hero-left"), largePath);
    await makeLink(page);
    const saved = await (await request.get(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } })).json();
    const photo = await (await request.get(`/media/${album.id}/${saved.album.panels["hero-left"]}`)).body();
    expect([(await sharp(photo).metadata()).width, (await sharp(photo).metadata()).height]).toEqual([2032, 1143]);
    expect(photo.length).toBeLessThan(8 * 1024 * 1024);

    const excessive = Buffer.from(landscapeImage.buffer);
    excessive.writeUInt32BE(16000, 16);
    excessive.writeUInt32BE(9000, 20);
    const decodes = await page.evaluate(() => document.documentElement.dataset.photoDecodes);
    const chooser = page.waitForEvent("filechooser");
    await panel(page, "hero-left").click();
    await (await chooser).setFiles({ name: "excessive.png", mimeType: "image/png", buffer: excessive });
    await expect(page.getByRole("alert").filter({ hasText: "4천만 픽셀 이하" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.photoDecodes)).toBe(decodes);
    await expect(page.locator(".panel.filled")).toHaveCount(1);
  } finally {
    await unlink(largePath).catch(() => undefined);
    await request.delete(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } });
  }
});

test("resizes large source photos locally and preserves portrait direction and transparency", async ({ page, request }) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  try {
    await page.goto(`/edit/${album.id}#key=${editToken}`);
    const original = await sharp(randomBytes(3840 * 2160 * 3), { raw: { width: 3840, height: 2160, channels: 3 } })
      .png({ compressionLevel: 0 }).toBuffer();
    expect(original.length).toBeGreaterThan(8 * 1024 * 1024);
    await chooseFile(page, panel(page, "hero-left"), { name: "4k.png", mimeType: "image/png", buffer: original });
    const rotated = await sharp({ create: { width: 3840, height: 2160, channels: 3, background: "#5074d8" } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    await chooseFile(page, panel(page, "hero-right"), { name: "rotated.jpg", mimeType: "image/jpeg", buffer: rotated });
    const transparent = await sharp({ create: { width: 160, height: 90, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 0.5 } } })
      .png().toBuffer();
    await chooseFile(page, panel(page, "memory-left-0"), { name: "alpha.png", mimeType: "image/png", buffer: transparent });
    await makeLink(page);
    const saved = await (await request.get(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } })).json();
    for (const [id, width, height] of [["hero-left", 1296, 729], ["hero-right", 729, 1296], ["memory-left-0", 1296, 729]] as const) {
      const bytes = await (await request.get(`/media/${album.id}/${saved.album.panels[id]}`)).body();
      const metadata = await sharp(bytes).metadata();
      expect([metadata.width, metadata.height, metadata.format]).toEqual([width, height, "png"]);
      expect(metadata.exif).toBeUndefined();
      if (id === "hero-left") expect(bytes.length).toBeLessThan(original.length / 5);
      // Saved previews come from the opaque world atlas.
      if (id === "memory-left-0") expect((await sharp(bytes).ensureAlpha().raw().toBuffer())[3]).toBe(255);
    }
    await page.reload();
    await expect(status(page)).toContainText("링크 준비됨");
    await expect(panel(page, "hero-left")).toHaveClass(/filled/);
  } finally {
    await request.delete(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } });
  }
});

test("concurrent edits preserve the first save and allow explicit reload", async ({ page, request }) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  await nameField(page).fill("이 브라우저의 수정");
  const otherSave = await request.put(`/api/albums/${album.id}`, {
    headers: { Authorization: `Bearer ${editToken}` },
    multipart: { nickname: "먼저 저장한 이름", revision: "0", remove: "[]" },
  });
  expect(otherSave.status()).toBe(200);
  await makeLinkButton(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "이미 변경" })).toBeVisible();
  await expect(nameField(page)).toHaveValue("이 브라우저의 수정");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "최신 내용 불러오기", exact: true }).click();
  await expect(nameField(page)).toHaveValue("먼저 저장한 이름");
  await expect(status(page)).toContainText("링크 준비됨");
});

test("create, save repeatedly, copy and load from another page", async ({ page, context, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await nameField(page).fill("멜비의 생일");
  await chooseFile(page, panel(page, "hero-left"), portraitImage);
  const firstAtlasUrl = await makeLink(page);
  const editLink = page.url();
  const id = editIdFrom(page);
  // Making the link does not copy it; the copy button does.
  expect(await page.evaluate(() => navigator.clipboard.readText())).not.toBe(firstAtlasUrl);
  await copyButton(page).click();
  await expect(copyButton(page)).toHaveText("복사됨");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(firstAtlasUrl);
  // The pressed state is brief so it never lingers as a stale "copied".
  await expect(copyButton(page)).toHaveText("링크 복사", { timeout: 5000 });
  let manifest = await (await request.get(`/data/${id}`)).json();
  expect([manifest.nickname, manifest.revision, manifest.panels.length]).toEqual(["멜비의 생일", 1, 1]);
  expect(firstAtlasUrl).toMatch(/^https?:\/\/[^/]+\/party\/[a-f0-9]{64}\/atlas\.png\?name=%EB%A9%9C%EB%B9%84%EC%9D%98%20%EC%83%9D%EC%9D%BC$/);
  const firstAtlas = await request.get(firstAtlasUrl);
  expect(firstAtlas.headers()["content-type"]).toContain("image/png");
  expect(await sharp(await firstAtlas.body()).metadata()).toMatchObject({ width: 2048, height: 2048 });
  const mediaUrl = manifest.panels[0].url;
  expect((await request.get(mediaUrl)).status()).toBe(200);

  await chooseFile(page, panel(page, "hero-right"), portraitImage);
  const secondAtlasUrl = await makeLink(page);
  manifest = await (await request.get(`/data/${id}`)).json();
  expect([manifest.revision, manifest.panels.length, manifest.panels[0].url]).toEqual([2, 2, mediaUrl]);
  expect(secondAtlasUrl).not.toBe(firstAtlasUrl);
  expect((await request.get(firstAtlasUrl)).status()).toBe(404);
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await copyButton(page).click();
  await expect(copyButton(page)).toHaveText("복사됨");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(secondAtlasUrl);

  await page.getByRole("link", { name: "새로 만들기" }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await page.getByLabel("월드에 붙여넣었던 링크").fill(editLink);
  await page.getByRole("dialog").getByRole("button", { name: "불러오기" }).click();
  await expect(nameField(page)).toHaveValue("멜비의 생일");
  expect(page.url()).toContain(id);
  await expect(copyButton(page)).toHaveText("링크 복사");
  // Hero-left is the fourth frame from the left on the left wall.
  await page.getByRole("button", { name: "사진 4 빼기" }).click();
  await makeLink(page);
  expect((await (await request.get(`/data/${id}`)).json()).panels).toHaveLength(1);

  const other = await context.browser()!.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(editLink);
  await expect(nameField(otherPage)).toHaveValue("멜비의 생일");
  await other.close();
  expect(errors).toEqual([]);
});

test("keyboard panel selection and mobile numbered slots target the chosen frame", async ({ page, request }) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  const target = panel(page, "memory-left-0");
  await target.focus();
  await expect(target).toBeFocused();
  const chooser = page.waitForEvent("filechooser");
  await target.press("Enter");
  await (await chooser).setFiles(landscapeImage);
  await expect(target).toHaveClass(/filled/);
  await makeLink(page);
  let manifest = await (await request.get(`/data/${album.id}`)).json();
  expect(manifest.panels.map((p: { objectName: string }) => p.objectName)).toEqual(["Memory -1 0"]);

  await page.setViewportSize({ width: 390, height: 844 });
  // Left wall, left to right: Memory -1 2, Memory -1 1, Memory -1 0, Hero portrait -1.
  await chooseFile(page, page.getByRole("button", { name: "사진 2 넣기", exact: true }), portraitImage);
  await makeLink(page);
  manifest = await (await request.get(`/data/${album.id}`)).json();
  expect(manifest.panels.map((p: { objectName: string }) => p.objectName)).toEqual(["Memory -1 0", "Memory -1 1"]);

  await page.locator(".slot-row").getByRole("button", { name: "사진 3 빼기", exact: true }).click();
  await makeLink(page);
  manifest = await (await request.get(`/data/${album.id}`)).json();
  expect(manifest.panels.map((p: { objectName: string }) => p.objectName)).toEqual(["Memory -1 1"]);
});

test("invalid load, missing token and malformed uploads are handled", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await page.getByLabel("월드에 붙여넣었던 링크").fill("bad-input");
  await page.getByRole("dialog").getByRole("button", { name: "불러오기" }).click();
  await expect(page.getByRole("alert")).toContainText("올바른 UUID");
  const created = await (await request.post("/api/albums")).json();
  expect((await request.get(`/api/albums/${created.album.id}`)).status()).toBe(401);
  const malformed = await request.put(`/api/albums/${created.album.id}`, {
    headers: { Authorization: `Bearer ${created.editToken}`, "Content-Type": "multipart/form-data; boundary=missing" },
    data: "invalid multipart",
  });
  expect(malformed.status()).toBe(400);
  await page.goto(`/edit/${created.album.id}`);
  await expect(page.getByRole("heading", { name: "이 링크를 열 수 없어요" })).toBeVisible();
});

test("center-crops other photo ratios without asking", async ({ page, request }) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  // Square and wider photos become landscape, taller ones portrait.
  await chooseFile(page, panel(page, "hero-left"), squareImage);
  await chooseFile(page, panel(page, "hero-right"), await makeImage(90, 200, "#3a8f5c", "tall.png"));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await makeLink(page);
  const { album: saved } = await (await request.get(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } })).json();
  const square = await (await request.get(`/media/${album.id}/${saved.panels["hero-left"]}`)).body();
  const tall = await (await request.get(`/media/${album.id}/${saved.panels["hero-right"]}`)).body();
  expect(await sharp(square).metadata()).toMatchObject({ width: 1792, height: 1008 });
  expect(await sharp(tall).metadata()).toMatchObject({ width: 1008, height: 1792 });
  // Cropping fills the frame; nothing is padded with black.
  const { data } = await sharp(tall).raw().toBuffer({ resolveWithObject: true });
  expect(Array.from(data.subarray(0, 3))).not.toEqual([0, 0, 0]);
  await request.delete(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } });
});

test("nickname changes mark the link stale until saved and reuse the existing PNG", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  await nameField(page).fill("첫 이름");
  const original = new URL(await makeLink(page));
  const originalBytes = await (await request.get(original.href)).body();
  const name = "멜비 ♡ + & ? # / 🎂";
  await nameField(page).fill(name);
  await expect(makeLinkButton(page)).toHaveText("새 링크 만들기");
  const updated = new URL(await makeLink(page));
  expect(updated.pathname).toBe(original.pathname);
  expect(updated.searchParams.get("name")).toBe(name);
  expect(await (await request.get(updated.href)).body()).toEqual(originalBytes);
  await copyButton(page).click();
  expect(new URL(await page.evaluate(() => navigator.clipboard.readText())).searchParams.get("name")).toBe(name);
  await page.reload();
  await expect(nameField(page)).toHaveValue(name);
  expect(new URL(await linkField(page).inputValue()).searchParams.get("name")).toBe(name);
  await nameField(page).fill("");
  expect(new URL(await makeLink(page)).searchParams.get("name")).toBe("");
});

test("copies without Clipboard API and selects the link when copying is blocked", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.addEventListener("copy", () => {
      const field = document.activeElement as HTMLTextAreaElement;
      document.documentElement.dataset.copiedText = field.value.slice(field.selectionStart, field.selectionEnd);
    });
  });
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  await nameField(page).fill("멜비 ♡ 🎂");
  const link = await makeLink(page);
  await copyButton(page).click();
  await expect(copyButton(page)).toHaveText("복사됨");
  expect(await page.evaluate(() => document.documentElement.dataset.copiedText)).toBe(link);
  await page.evaluate(() => { document.execCommand = () => false; });
  await page.waitForTimeout(100);
  await copyButton(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ctrl+C" })).toBeVisible();
  await expect(copyButton(page)).toHaveText("링크 복사");
  const field = linkField(page);
  await expect(field).toBeFocused();
  expect(await field.evaluate((input: HTMLInputElement) => input.value.slice(input.selectionStart!, input.selectionEnd!))).toBe(link);
  expect(await page.locator("textarea").count()).toBe(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: "artifacts/screenshots/link-mobile.png", fullPage: true });
});

test("load accepts a world PNG URL with encoded nickname and preserves edit authorization", async ({ page, context, request }) => {
  await page.goto("/");
  await nameField(page).fill("설보&pea");
  const worldLink = await makeLink(page);
  const originalEdit = page.url();
  expect(new URL(worldLink).searchParams.get("name")).toBe("설보&pea");
  await page.goto("/");
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await page.getByLabel("월드에 붙여넣었던 링크").fill(worldLink);
  await page.getByRole("dialog").getByRole("button", { name: "불러오기" }).click();
  await expect(page).toHaveURL(originalEdit);
  await expect(nameField(page)).toHaveValue("설보&pea");
  const hash = new URL(worldLink).pathname.split("/")[2];
  expect((await request.get(`/api/albums/resolve?atlas=${"0".repeat(64)}`)).status()).toBe(404);
  expect((await request.get("/api/albums/resolve?atlas=../bad")).status()).toBe(400);
  expect(Object.keys(await (await request.get(`/api/albums/resolve?atlas=${hash}`)).json())).toEqual(["ids"]);
  const other = await context.browser()!.newContext();
  try {
    const otherPage = await other.newPage();
    await otherPage.goto(new URL("/", page.url()).href);
    await otherPage.getByRole("button", { name: "불러오기", exact: true }).click();
    await otherPage.getByLabel("월드에 붙여넣었던 링크").fill(worldLink);
    await otherPage.getByRole("dialog").getByRole("button", { name: "불러오기" }).click();
    await expect(otherPage.getByRole("alert").filter({ hasText: "수정 권한이 없어요" })).toBeVisible();
    expect(new URL(otherPage.url()).pathname).toBe("/");
  } finally {
    await other.close();
  }
});

test("publishes all eight panel positions with mixed directions", async ({ page, request }) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  const panels = page.locator(".panel");
  for (let i = 0; i < 8; i++) {
    await chooseFile(page, panels.nth(i), i % 2 ? portraitImage : landscapeImage);
    await expect(page.locator(".panel.filled")).toHaveCount(i + 1);
  }
  await makeLink(page);
  const saved = await (await request.get(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } })).json();
  expect(Object.values(saved.album.panelOrientations).filter((value) => value === "portrait")).toHaveLength(4);
  expect(Object.keys(saved.album.panelOrientations)).toHaveLength(8);
  const published = await request.get(saved.dataUrl);
  expect(published.status()).toBe(200);
  const { data, info } = await sharp(await published.body()).raw().toBuffer({ resolveWithObject: true });
  let activeCount = 0;
  for (let bit = 0; bit < 8; bit++) {
    const offset = (4 * info.width + (5 * 8 + bit) * 8 + 4) * info.channels;
    activeCount = (activeCount << 1) | (data[offset] === 255 ? 1 : 0);
  }
  expect(activeCount).toBe(8);
  await page.screenshot({ path: "artifacts/screenshots/atlas-editor.png", fullPage: true });
});

test("drop fills the targeted frame, and several dropped photos fill empty frames", async ({ page, request }) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  const target = panel(page, "memory-right-1");
  async function drop(files: TestImage[]) {
    const transfer = await page.evaluateHandle((items) => {
      const transfer = new DataTransfer();
      for (const item of items) transfer.items.add(new File([new Uint8Array(item.bytes)], item.name, { type: item.mimeType }));
      return transfer;
    }, files.map((file) => ({ name: file.name, mimeType: file.mimeType, bytes: Array.from(file.buffer) })));
    try {
      await target.dispatchEvent("dragover", { dataTransfer: transfer });
      await expect(target).toHaveClass(/drop/);
      await target.dispatchEvent("drop", { dataTransfer: transfer });
      await expect(target).not.toHaveClass(/\bdrop\b/);
      // Frames ignore drops while a photo is still being prepared.
      await expect(status(page)).not.toContainText("사진 준비 중");
    } finally {
      await transfer.dispose();
    }
  }
  await drop([landscapeImage]);
  await expect(target).toHaveClass(/filled/);
  await expect(page.locator(".panel.filled")).toHaveCount(1);
  const firstPreview = await target.locator("img").getAttribute("src");
  await drop([squareImage]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(target.locator("img")).not.toHaveAttribute("src", firstPreview!);
  await drop([portraitImage]);

  await drop([landscapeImage, squareImage]);
  await expect(page.locator(".photo-notice")).toContainText("2장을 넣었어요");
  await expect(page.locator(".panel.filled")).toHaveCount(3);
  await makeLink(page);
  const saved = await (await request.get(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } })).json();
  expect(Object.entries(saved.album.panels).filter(([, photo]) => photo).map(([id]) => id).sort())
    .toEqual(["hero-left", "hero-right", "memory-right-1"]);
  expect(saved.album.panelOrientations["memory-right-1"]).toBe("portrait");
  // Other ratios are center-cropped instead of asking.
  expect(saved.album.panelOrientations["hero-right"]).toBe("landscape");
});

test("adding several photos at once fills empty frames in order and reports skipped ones", async ({ page, request }) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  await chooseFile(page, panel(page, "hero-left"), portraitImage);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "여러 장 한 번에 넣기" }).click();
  const fileChooser = await chooser;
  expect(fileChooser.isMultiple()).toBe(true);
  await fileChooser.setFiles(Array.from({ length: 8 }, (_, i) => ({ ...(i % 2 ? portraitImage : landscapeImage), name: `photo-${i}.png` })));
  await expect(page.locator(".photo-notice")).toContainText("7장을 넣었어요");
  await expect(page.locator(".photo-notice")).toContainText("1장은 넣지 못했어요");
  await expect(page.locator(".panel.filled")).toHaveCount(8);
  await expect(status(page)).toHaveText("사진 8장 준비됨");
  await page.getByRole("button", { name: "여러 장 한 번에 넣기" }).click();
  await expect(page.locator(".photo-notice")).toContainText("빈 액자가 없어요");
  await request.delete(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } });
});
