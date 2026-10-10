import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";

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
    await continueToPhotos(page);
    const large = await sharp({ create: { width: 7680, height: 4320, channels: 3, background: "#3e9abc" } }).png({ compressionLevel: 0 }).toBuffer();
    expect(large.length).toBeGreaterThan(60 * 1024 * 1024);
    await writeFile(largePath, large);
    await chooseFileFrom(page, page.getByRole("button", { name: "1. 대표 사진 · 왼쪽, 비어 있음", exact: true }),
      largePath);
    await page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
    await page.getByRole("button", { name: "사진 수정하기", exact: true }).click();
    const saved = await (await request.get(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } })).json();
    const photo = await (await request.get(`/media/${album.id}/${saved.album.panels["hero-left"]}`)).body();
    const info = await sharp(photo).metadata();
    expect([info.width, info.height]).toEqual([2048, 1152]);
    expect(photo.length).toBeLessThan(8 * 1024 * 1024);
    const excessive = Buffer.from(landscapeImage.buffer);
    excessive.writeUInt32BE(16000, 16);
    excessive.writeUInt32BE(9000, 20);
    const decodes = await page.evaluate(() => document.documentElement.dataset.photoDecodes);
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "1. 대표 사진 · 왼쪽, 사진 설정됨", exact: true }).click();
    await (await chooserPromise).setFiles({ name: "excessive.png", mimeType: "image/png", buffer: excessive });
    await expect(page.getByRole("alert").filter({ hasText: "4천만 픽셀 이하" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.photoDecodes)).toBe(decodes);
    await expect(page.locator(".scene-panel.populated")).toHaveCount(1);
  } finally {
    await unlink(largePath).catch(() => undefined);
    await request.delete(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } });
  }
});

test("resizes large source photos locally and preserves portrait direction and transparency", async ({ page, request }) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  try {
    await page.goto(`/edit/${album.id}#key=${editToken}`);
    await continueToPhotos(page);
    const original = await sharp(randomBytes(3840 * 2160 * 3), {
      raw: { width: 3840, height: 2160, channels: 3 },
    }).png({ compressionLevel: 0 }).toBuffer();
    expect(original.length).toBeGreaterThan(8 * 1024 * 1024);
    await chooseFileFrom(page, page.getByRole("button", { name: "1. 대표 사진 · 왼쪽, 비어 있음", exact: true }),
      { name: "4k.png", mimeType: "image/png", buffer: original });
    const portrait = await sharp({ create: { width: 3840, height: 2160, channels: 3, background: "#5074d8" } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    await chooseFileFrom(page, page.getByRole("button", { name: "2. 대표 사진 · 오른쪽, 비어 있음", exact: true }),
      { name: "rotated.jpg", mimeType: "image/jpeg", buffer: portrait });
    const transparent = await sharp({ create: { width: 160, height: 90, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 0.5 } } })
      .png().toBuffer();
    await chooseFileFrom(page, page.getByRole("button", { name: "3. 갤러리 · 왼쪽 01, 비어 있음", exact: true }),
      { name: "alpha.png", mimeType: "image/png", buffer: transparent });
    await page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
    const saved = await (await request.get(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } })).json();
    for (const [panel, width, height] of [["hero-left", 2048, 1152], ["hero-right", 1152, 2048], ["memory-left-0", 160, 90]] as const) {
      const media = await request.get(`/media/${album.id}/${saved.album.panels[panel]}`);
      const bytes = await media.body();
      const metadata = await sharp(bytes).metadata();
      expect(metadata.width).toBe(width);
      expect(metadata.height).toBe(height);
      expect(metadata.format).toBe("webp");
      expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
      expect(metadata.exif).toBeUndefined();
      if (panel === "hero-left") expect(bytes.length).toBeLessThan(original.length / 5);
      if (panel === "memory-left-0") {
        const pixel = await sharp(bytes).raw().toBuffer();
        expect(pixel[3]).toBeGreaterThan(120);
        expect(pixel[3]).toBeLessThan(135);
      }
    }
    await page.reload();
    await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
    await expect(page.getByRole("button", { name: "1. 대표 사진 · 왼쪽, 사진 설정됨", exact: true })).toBeVisible();
  } finally {
    await request.delete(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } });
  }
});

const landscapeImage = await makeImage(160, 90, "#c94b6d", "landscape.png");
const portraitImage = await makeImage(90, 160, "#5074d8", "portrait.jpg");
const invalidRatioImage = await makeImage(120, 120, "#777777", "square.png");

async function chooseFileFrom(
  page: Page,
  trigger: Locator,
  file: string | typeof landscapeImage = landscapeImage,
) {
  const chooserPromise = page.waitForEvent("filechooser");
  await trigger.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
  await expect(page.getByRole("status")).toHaveText("저장하지 않은 변경 사항");
}

async function chooseFileWithKeyboard(
  page: Page,
  trigger: Locator,
  file = landscapeImage,
) {
  await trigger.focus();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
  await expect(page.getByRole("status")).toHaveText("저장하지 않은 변경 사항");
}

async function continueToPhotos(page: Page, name?: string) {
  await expect(page.getByRole("button", { name: "1. 이름 입력", exact: true })).toBeVisible();
  await expect(nameField(page)).toBeVisible();
  if (name !== undefined) await nameField(page).fill(name);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("button", { name: "2. 사진 등록", exact: true })).toBeEnabled();
  await expect(page.locator(".scene-panel").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "사진을 등록하세요.", exact: true })).toBeFocused();
}

function nameField(page: Page) {
  return page.getByRole("textbox", { name: /생일자의 이름/ });
}

async function openNameStep(page: Page) {
  await page.getByRole("button", { name: "1. 이름 입력", exact: true }).click();
  await expect(nameField(page)).toBeVisible();
}

async function openPhotoStep(page: Page) {
  await page.getByRole("button", { name: "2. 사진 등록", exact: true }).click();
  await expect(page.locator(".scene-panel").first()).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("concurrent edits preserve the first save and allow explicit reload", async ({ page, request }) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  await expect(nameField(page)).toBeVisible();
  await nameField(page).fill("이 브라우저의 수정");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const otherSave = await request.put(`/api/albums/${album.id}`, {
    headers: { Authorization: `Bearer ${editToken}` },
    multipart: { nickname: "먼저 저장한 이름", revision: "0", remove: "[]" },
  });
  expect(otherSave.status()).toBe(200);
  await page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "이미 변경" })).toBeVisible();
  await expect(page.locator(".scene-panel").first()).toBeVisible();
  await expect(page.locator(".name-summary strong")).toHaveText("이 브라우저의 수정");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "최신 내용 불러오기", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  await openNameStep(page);
  await expect(nameField(page)).toHaveValue("먼저 저장한 이름");
});

test("step flow focuses each task, preserves edits and hides stale links", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect.poll(() => page.locator(".entry-world img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(3480);
  await page.locator(".entry-world img").evaluate((img: HTMLImageElement) => img.decode());
  await page.screenshot({ path: "artifacts/screenshots/entry-hires-desktop.png", fullPage: true });
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  await expect(nameField(page)).toBeFocused();
  await expect(page.getByRole("button", { name: "2. 사진 등록", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "3. 링크 복사", exact: true })).toBeDisabled();
  await page.screenshot({ path: "artifacts/screenshots/step-name-desktop.png", fullPage: true });

  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("heading", { name: "사진을 등록하세요.", exact: true })).toBeFocused();
  await expect(page.getByText("사진 형식과 보관 기간", { exact: true })).toHaveCount(0);
  await expect(page.locator(".gallery-footnote")).toBeVisible();
  await expect(page.locator(".gallery-footnote")).toContainText("저장 후 24시간 보관");
  await expect(nameField(page)).not.toBeVisible();
  await chooseFileFrom(page, page.locator('[data-panel-id="hero-left"]'), landscapeImage);
  await expect(page.locator('[data-panel-id="hero-left"]')).toHaveClass(/populated/);
  await expect.poll(() => page.locator(".world-canvas > img").evaluateAll((images: HTMLImageElement[]) => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
  await expect(page.locator(".world-canvas > img").first()).toHaveJSProperty("naturalWidth", 4800);
  await page.screenshot({ path: "artifacts/screenshots/step-photos-desktop.png", fullPage: true });

  await openNameStep(page);
  await expect(nameField(page)).toBeFocused();
  await nameField(page).fill("나쁜\u0001이름");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "제어 문자" })).toBeVisible();
  await expect(nameField(page)).toBeVisible();
  await nameField(page).fill("테스트 생일");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator('[data-panel-id="hero-left"]')).toHaveClass(/populated/);

  await page.getByRole("button", { name: "저장하고 링크 만들기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "링크를 복사하세요.", exact: true })).toBeFocused();
  await expect(page.locator(".world-link")).toBeVisible();
  await expect(page.locator(".link-expiry")).toHaveText("링크는 저장 후 24시간 동안만 유효합니다. 이후에는 링크가 만료되고 사진도 삭제됩니다.");
  await expect(page.getByRole("img", { name: "월드의 생일 사진 설정 패널에 있는 아틀라스 이미지 URL 입력칸과 적용 버튼" })).toBeVisible();
  await expect(page.getByText("링크 붙여넣기", { exact: true })).toBeVisible();
  await expect.poll(() => page.locator(".world-input-shot img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator(".scene-workspace")).not.toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/step-link-desktop.png", fullPage: true });
  const firstLink = await page.getByLabel("VRChat용 이미지 링크", { exact: true }).inputValue();

  await page.getByRole("button", { name: "사진 수정하기", exact: true }).click();
  await expect(page.locator('[data-panel-id="hero-left"]')).toHaveClass(/populated/);
  await openNameStep(page);
  await nameField(page).fill("테스트 생일 수정");
  await expect(page.getByRole("button", { name: "3. 링크 복사", exact: true })).toBeDisabled();
  await expect(page.locator(".world-link")).not.toBeVisible();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "변경 사항 저장", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  const secondLink = await page.getByLabel("VRChat용 이미지 링크", { exact: true }).inputValue();
  expect(new URL(secondLink).pathname).toBe(new URL(firstLink).pathname);
  expect(new URL(secondLink).searchParams.get("name")).toBe("테스트 생일 수정");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/screenshots/step-link-mobile.png", fullPage: true });
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "테마 전환", exact: true }).click();
  await expect(page.getByLabel("VRChat용 이미지 링크", { exact: true })).toHaveCSS("color", "rgb(237, 230, 244)");
  await expect(page.getByRole("button", { name: "사진 수정하기", exact: true })).toHaveCSS("background-color", "rgb(35, 29, 43)");
  await page.screenshot({ path: "artifacts/screenshots/step-link-dark-mobile.png", fullPage: true });
  await expectNoHorizontalOverflow(page);

  await openNameStep(page);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: "artifacts/screenshots/step-name-dark-mobile.png", fullPage: true });
  await openPhotoStep(page);
  await expectNoHorizontalOverflow(page);
  await page.locator('[data-world-side="left"]').getByRole("button", { name: "패널 보기", exact: true }).click();
  await expect.poll(async () => {
    const panel = await page.locator('[data-panel-id="hero-left"]').boundingBox();
    return panel !== null && panel.x >= 14 && panel.x + panel.width <= 376;
  }).toBe(true);
  const saveBounds = await page.locator(".controller-save").boundingBox();
  expect(saveBounds!.y + saveBounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "artifacts/screenshots/step-photos-dark-mobile.png", fullPage: true });

  await request.delete(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } });
});

test("create, select real scene panel, save repeatedly, copy and load", async ({
  page,
  context,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(
    page.getByRole("img", {
      name: "Birthday World의 생일 홀과 사진 갤러리",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "새로 만들기" }).click();
  await expect(nameField(page)).toBeVisible();
  const editLink = page.url();
  const id = new URL(editLink).pathname.split("/").pop()!;
  await nameField(page).fill("멜비의 생일");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await chooseFileFrom(
    page,
    page.getByRole("button", {
      name: "1. 대표 사진 · 왼쪽, 비어 있음",
      exact: true,
    }),
    portraitImage,
  );
  await page
    .getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  await expect(page.locator(".world-link")).toBeVisible();
  await expect(page.locator(".scene-workspace")).not.toBeVisible();
  let manifest = await (await request.get(`/data/${id}`)).json();
  expect(manifest.nickname).toBe("멜비의 생일");
  expect(manifest.revision).toBe(1);
  expect(manifest.panels).toHaveLength(1);
  const firstAtlasUrl = await page.getByLabel("VRChat용 이미지 링크", { exact: true }).inputValue();
  expect(firstAtlasUrl).toMatch(
    /^https?:\/\/[^/]+\/party\/[a-f0-9]{64}\/atlas\.png\?name=%EB%A9%9C%EB%B9%84%EC%9D%98%20%EC%83%9D%EC%9D%BC$/,
  );
  const firstAtlas = await request.get(firstAtlasUrl);
  expect(firstAtlas.status()).toBe(200);
  expect(firstAtlas.headers()["content-type"]).toContain("image/png");
  const firstAtlasBytes = await firstAtlas.body();
  const mediaUrl = manifest.panels[0].url;
  expect((await request.get(mediaUrl)).status()).toBe(200);
  await page.getByRole("button", { name: "사진 수정하기", exact: true }).click();
  await expect(page.locator(".scene-panel").first()).toBeVisible();
  await chooseFileFrom(
    page,
    page.getByRole("button", {
      name: "2. 대표 사진 · 오른쪽, 비어 있음",
      exact: true,
    }),
    portraitImage,
  );
  await page
    .getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  await expect(page.locator(".world-link")).toBeVisible();
  manifest = await (await request.get(`/data/${id}`)).json();
  expect(manifest.revision).toBe(2);
  expect(manifest.panels).toHaveLength(2);
  expect(manifest.panels[1].url).toBe(mediaUrl);
  const secondAtlasUrl = await page.getByLabel("VRChat용 이미지 링크", { exact: true }).inputValue();
  expect(secondAtlasUrl).toMatch(
    /^https?:\/\/[^/]+\/party\/[a-f0-9]{64}\/atlas\.png\?name=%EB%A9%9C%EB%B9%84%EC%9D%98%20%EC%83%9D%EC%9D%BC$/,
  );
  expect(secondAtlasUrl).not.toBe(firstAtlasUrl);
  expect(await (await request.get(firstAtlasUrl)).body()).toEqual(firstAtlasBytes);
  await page
    .getByRole("button", { name: "VRChat용 이미지 링크 복사", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    secondAtlasUrl,
  );
  await page.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "처음으로", exact: true }).click();
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await page.getByLabel("월드에 사용한 링크").fill(editLink);
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await expect(page.locator(".scene-panel").first()).toBeVisible();
  await expect(nameField(page)).not.toBeVisible();
  await openNameStep(page);
  await expect(nameField(page)).toHaveValue("멜비의 생일");
  await openPhotoStep(page);
  expect(page.url()).toContain(id);
  await page.getByRole("button", { name: "저장하고 링크 만들기", exact: true }).click();
  await expect(page.locator(".world-link")).toBeVisible();
  expect((await (await request.get(`/data/${id}`)).json()).revision).toBe(2);
  await page.getByRole("button", { name: "사진 수정하기", exact: true }).click();
  await page.getByRole("button", { name: "L1 사진 제거" }).click();
  await page
    .getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  expect((await (await request.get(`/data/${id}`)).json()).panels).toHaveLength(
    1,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/editor-mobile.png",
    fullPage: true,
  });
  await expectNoHorizontalOverflow(page);
  const other = await context.browser()!.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(editLink);
  await expect(otherPage.locator(".scene-panel").first()).toBeVisible();
  await expect(nameField(otherPage)).not.toBeVisible();
  await openNameStep(otherPage);
  await expect(nameField(otherPage)).toHaveValue("멜비의 생일");
  await other.close();
  expect(errors).toEqual([]);
});

test("keyboard scene selection and mobile numbered fallback target the chosen slot", async ({
  page,
  request,
}) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  await continueToPhotos(page, "키보드와 모바일 선택");

  await chooseFileWithKeyboard(
    page,
    page.getByRole("button", {
      name: "3. 갤러리 · 왼쪽 01, 비어 있음",
      exact: true,
    }),
  );
  await page
    .getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  let manifest = await (await request.get(`/data/${album.id}`)).json();
  expect(manifest.panels.map((p: { objectName: string }) => p.objectName)).toEqual([
    "Memory -1 0",
  ]);

  await page.getByRole("button", { name: "사진 수정하기", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const shortcutGroup = page.getByRole("group", { name: "사진 패널 번호" });
  await expect(shortcutGroup).toBeVisible();
  for (const button of await shortcutGroup.getByRole("button").all()) {
    const bounds = await button.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  await chooseFileFrom(
    page,
    shortcutGroup.getByRole("button", {
      name: "4. 갤러리 · 왼쪽 02, 비어 있음",
      exact: true,
    }),
    portraitImage,
  );
  await page
    .getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  manifest = await (await request.get(`/data/${album.id}`)).json();
  expect(manifest.panels.map((p: { objectName: string }) => p.objectName)).toEqual([
    "Memory -1 0",
    "Memory -1 1",
  ]);

  await page.getByRole("button", { name: "사진 수정하기", exact: true }).click();
  await page.getByRole("button", { name: "L3 사진 제거" }).click();
  await page
    .getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  manifest = await (await request.get(`/data/${album.id}`)).json();
  expect(manifest.panels.map((p: { objectName: string }) => p.objectName)).toEqual([
    "Memory -1 0",
  ]);
});

test("invalid load, missing token and malformed uploads are handled", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await page.getByLabel("월드에 사용한 링크").fill("bad-input");
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("올바른 UUID");
  const created = await (await request.post("/api/albums")).json();
  expect((await request.get(`/api/albums/${created.album.id}`)).status()).toBe(
    401,
  );
  const malformed = await request.put(`/api/albums/${created.album.id}`, {
    headers: {
      Authorization: `Bearer ${created.editToken}`,
      "Content-Type": "multipart/form-data; boundary=missing",
    },
    data: "invalid multipart",
  });
  expect(malformed.status()).toBe(400);
  await page.goto(`/edit/${created.album.id}`);
  await expect(
    page.getByRole("heading", { name: "공간을 열 수 없어요" }),
  ).toBeVisible();
});

test("fits other photo ratios locally and preserves the previous photo on cancel", async ({
  page,
  request,
}) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  await continueToPhotos(page);

  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "1. 대표 사진 · 왼쪽, 비어 있음", exact: true })
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles(invalidRatioImage);

  const dialog = page.getByRole("dialog", { name: "사진 맞추기" });
  async function chooseForFraming(target: Locator) {
    const chooser = page.waitForEvent("filechooser");
    await target.click();
    await (await chooser).setFiles(invalidRatioImage);
    await expect(dialog).toBeVisible();
  }
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "이 사진 사용", exact: true }).click();
  const panel = page.locator('[data-panel-id="hero-left"]');
  await expect(panel).toHaveClass(/populated/);
  const prior = await panel.locator("img").getAttribute("src");
  await chooseForFraming(panel);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(panel.locator("img")).toHaveAttribute("src", prior!);

  await chooseForFraming(page.locator('[data-panel-id="hero-right"]'));
  await dialog.getByRole("button", { name: "세로", exact: true }).click();
  await dialog.getByRole("button", { name: "여백 넣기", exact: true }).click();
  await page.screenshot({ path: "artifacts/screenshots/photo-framing-desktop.png", fullPage: true });
  await dialog.getByRole("button", { name: "이 사진 사용", exact: true }).click();
  await expect(page.locator('[data-panel-id="hero-right"]')).toHaveClass(/populated/);
  await page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  const manifest = await (await request.get(`/data/${album.id}`)).json();
  expect(manifest.panels).toHaveLength(2);
  const { album: saved } = await (await request.get(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } })).json();
  const cropped = await (await request.get(`/media/${album.id}/${saved.panels["hero-left"]}`)).body();
  const padded = await (await request.get(`/media/${album.id}/${saved.panels["hero-right"]}`)).body();
  expect(await sharp(cropped).metadata()).toMatchObject({ width: 112, height: 63 });
  expect(await sharp(padded).metadata()).toMatchObject({ width: 63, height: 112 });
  const {data, info} = await sharp(padded).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  expect(Array.from(data.subarray(0, 4))).toEqual([0, 0, 0, 255]);
  expect(data[(56 * info.width + 31) * 4 + 3]).toBe(255);
  await request.delete(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } });
});

test("nickname changes hide stale links until save and reuse the existing PNG", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  await continueToPhotos(page, "첫 이름");
  await page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  const linkField = page.getByLabel("VRChat용 이미지 링크", { exact: true });
  const original = new URL(await linkField.inputValue());
  const originalBytes = await (await request.get(original.href)).body();
  const name = "멜비 ♡ + & ? # / 🎂";
  await openNameStep(page);
  await nameField(page).fill(name);
  await expect(page.getByRole("button", { name: "3. 링크 복사", exact: true })).toBeDisabled();
  await expect(page.locator(".world-link")).not.toBeVisible();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  const updated = new URL(await linkField.inputValue());
  expect(new URL(await linkField.inputValue()).pathname).toBe(original.pathname);
  expect(updated.searchParams.get("name")).toBe(name);
  expect(await (await request.get(updated.href)).body()).toEqual(originalBytes);
  await page.getByRole("button", { name: "VRChat용 이미지 링크 복사", exact: true }).click();
  expect(new URL(await page.evaluate(() => navigator.clipboard.readText())).searchParams.get("name")).toBe(name);
  await page.reload();
  await expect(page.locator(".scene-panel").first()).toBeVisible();
  await openNameStep(page);
  await expect(nameField(page)).toHaveValue(name);
  await page.getByRole("button", { name: "3. 링크 복사", exact: true }).click();
  expect(new URL(await linkField.inputValue()).searchParams.get("name")).toBe(name);
  await openNameStep(page);
  await nameField(page).fill("");
  await expect(page.getByRole("button", { name: "3. 링크 복사", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  expect(new URL(await linkField.inputValue()).searchParams.get("name")).toBe("");
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
  await continueToPhotos(page, "멜비 ♡ 🎂");
  await page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  const field = page.getByLabel("VRChat용 이미지 링크", { exact: true });
  const link = await field.inputValue();
  await page.getByRole("button", { name: "VRChat용 이미지 링크 복사", exact: true }).click();
  await expect(page.getByRole("button", { name: "VRChat용 이미지 링크 복사", exact: true })).toContainText("복사했어요");
  expect(await page.evaluate(() => document.documentElement.dataset.copiedText)).toBe(link);
  await page.evaluate(() => { document.execCommand = () => false; });
  await page.getByRole("button", { name: "VRChat용 이미지 링크 복사", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ctrl+C" })).toBeVisible();
  await expect(field).toBeFocused();
  expect(await field.evaluate((input: HTMLInputElement) => input.value.slice(input.selectionStart!, input.selectionEnd!))).toBe(link);
  expect(await page.locator("textarea").count()).toBe(0);
});

test("Load accepts a world PNG URL with encoded nickname and preserves edit authorization", async ({ page, context, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "새로 만들기", exact: true }).click();
  await nameField(page).fill("설보&pea");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  const originalEdit = page.url();
  const worldLink = await page.getByLabel("VRChat용 이미지 링크", { exact: true }).inputValue();
  expect(new URL(worldLink).searchParams.get("name")).toBe("설보&pea");
  await page.goto("/");
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await page.getByLabel("월드에 사용한 링크").fill(worldLink);
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await expect(page).toHaveURL(originalEdit);
  await expect(page.locator(".scene-panel").first()).toBeVisible();
  await openNameStep(page);
  await expect(nameField(page)).toHaveValue("설보&pea");
  const hash = new URL(worldLink).pathname.split("/")[2];
  expect((await request.get(`/api/albums/resolve?atlas=${"0".repeat(64)}`)).status()).toBe(404);
  expect((await request.get("/api/albums/resolve?atlas=../bad")).status()).toBe(400);
  const resolved = await (await request.get(`/api/albums/resolve?atlas=${hash}`)).json();
  expect(Object.keys(resolved)).toEqual(["ids"]);
  const other = await context.browser()!.newContext();
  try {
    const otherPage = await other.newPage();
    await otherPage.goto(new URL("/", page.url()).href);
    await otherPage.getByRole("button", { name: "불러오기", exact: true }).click();
    await otherPage.getByLabel("월드에 사용한 링크").fill(worldLink);
    await otherPage.getByRole("button", { name: "불러오기", exact: true }).click();
    await expect(otherPage.getByRole("alert").filter({ hasText: "편집 권한이 없어요" })).toBeVisible();
    expect(new URL(otherPage.url()).pathname).toBe("/");
  } finally {
    await other.close();
  }
});

test("publishes all eight panel positions with mixed directions", async ({ page, request }) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  await continueToPhotos(page);
  const shortcuts = page.locator(".scene-panel");
  for (let i = 0; i < 8; i++) {
    await chooseFileFrom(page, shortcuts.nth(i), i % 2 ? portraitImage : landscapeImage);
    await expect(page.locator(".scene-panel.populated")).toHaveCount(i + 1);
  }
  await page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  const saved = await (await request.get(`/api/albums/${album.id}`, {
    headers: { Authorization: `Bearer ${editToken}` },
  })).json();
  expect(Object.values(saved.album.panelOrientations).filter(value => value === "portrait")).toHaveLength(4);
  expect(Object.keys(saved.album.panelOrientations)).toHaveLength(8);
  expect(saved.album.id).toBe(album.id);
  const published = await request.get(saved.dataUrl);
  expect(published.status()).toBe(200);
  const { data, info } = await sharp(await published.body()).raw().toBuffer({ resolveWithObject: true });
  let activeCount = 0;
  for (let bit = 0; bit < 8; bit++) {
    const cell = 5 * 8 + bit;
    const offset = (4 * info.width + cell * 8 + 4) * info.channels;
    activeCount = (activeCount << 1) | (data[offset] === 255 ? 1 : 0);
  }
  expect(activeCount).toBe(8);
  await page.screenshot({ path: "artifacts/screenshots/atlas-editor.png", fullPage: true });
});

test("drop assigns only the targeted panel and reveals the link after saving", async ({ page, request }) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  await continueToPhotos(page);
  await expect(page.locator(".world-link")).toHaveCount(0);
  await expect(page.locator(".scene-end-labels")).toHaveCount(0);
  await expect(page.locator(".scene-instruction")).toHaveCount(0);
  await expect(page.locator(".photo-step-heading")).not.toContainText("/ 8");
  const panel = page.locator('[data-panel-id="memory-right-1"]');
  async function drop(files: typeof landscapeImage[]) {
    const transfer = await page.evaluateHandle(items => {
      const transfer = new DataTransfer();
      for (const item of items) transfer.items.add(new File([new Uint8Array(item.bytes)], item.name, { type: item.mimeType }));
      return transfer;
    }, files.map(file => ({ name: file.name, mimeType: file.mimeType, bytes: Array.from(file.buffer) })));
    try {
      await panel.dispatchEvent("dragover", { dataTransfer: transfer });
      await expect(panel).toHaveClass(/drop-target/);
      await panel.dispatchEvent("drop", { dataTransfer: transfer });
      await expect(panel).not.toHaveClass(/drop-target/);
    } finally { await transfer.dispose(); }
  }
  await drop([landscapeImage]);
  await expect(panel).toHaveClass(/populated/);
  await expect(panel).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(panel).toHaveCSS("opacity", "1");
  await expect(page.locator(".scene-panel.populated")).toHaveCount(1);
  await expect(page.locator(".world-link")).toHaveCount(0);
  const firstPreview = await panel.locator("img").getAttribute("src");
  await drop([invalidRatioImage]);
  await expect(page.getByRole("dialog", { name: "사진 맞추기" })).toBeVisible();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(panel.locator("img")).toHaveAttribute("src", firstPreview!);
  await drop([landscapeImage, portraitImage]);
  await expect(page.getByRole("alert").filter({ hasText: "한 장씩" })).toBeVisible();
  await expect(panel.locator("img")).toHaveAttribute("src", firstPreview!);
  await drop([portraitImage]);
  await expect(panel.locator("img")).not.toHaveAttribute("src", firstPreview!);
  await panel.hover();
  await expect(panel).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(panel).toHaveCSS("opacity", "1");
  await expect(page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  await expect(page.locator(".world-link")).toBeVisible();
  const saved = await (await request.get(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } })).json();
  expect(Object.entries(saved.album.panels).filter(([, photo]) => photo).map(([id]) => id)).toEqual(["memory-right-1"]);
  expect(saved.album.panelOrientations["memory-right-1"]).toBe("portrait");
  expect((await request.get(await page.getByLabel("VRChat용 이미지 링크", { exact: true }).inputValue())).status()).toBe(200);
});

async function makeImage(
  width: number,
  height: number,
  color: string,
  name: string,
) {
  const type = name.endsWith(".jpg") ? "image/jpeg" : "image/png";
  const format = name.endsWith(".jpg") ? "jpeg" : "png";
  return {
    name,
    mimeType: type,
    buffer: await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: color,
      },
    })
      .toFormat(format)
      .toBuffer(),
  };
}



