import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

test("creation is dominant and photo editing remains usable at desktop and mobile sizes", async ({ page, request }) => {
  await page.goto("/");
  const hero = page.getByRole("img", { name: "Birthday World의 생일 홀과 사진 갤러리" });
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const create = page.getByRole("button", { name: "새로 만들기", exact: true });
  const load = page.getByRole("button", { name: "불러오기", exact: true });
  const primary = (await create.boundingBox())!;
  const secondary = (await load.boundingBox())!;
  expect(primary.height).toBeGreaterThanOrEqual(64);
  expect(primary.width * primary.height).toBeGreaterThan(secondary.width * secondary.height * 2);
  await page.screenshot({ path: "artifacts/screenshots/redesign-home-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 780 });
  const mobileCreate = (await create.boundingBox())!;
  expect(mobileCreate.y + mobileCreate.height).toBeLessThan(780);
  expect(mobileCreate.width).toBeGreaterThan(260);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.screenshot({ path: "artifacts/screenshots/redesign-home-mobile.png", fullPage: true });
  await create.click();
  await expect(page.getByLabel("생일자의 이름")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const nameBounds = (await page.getByLabel("생일자의 이름").boundingBox())!;
  const galleryBounds = (await page.locator(".controller-workspace").boundingBox())!;
  expect(Math.abs(nameBounds.width - galleryBounds.width)).toBeLessThan(2);
  await expect(page.locator(".photo-control, .edit-link, .scene-panel.active, .scene-panel[aria-pressed]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "편집 링크 복사", exact: true })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "왼쪽 사진 패널 실제 위치" })).toBeVisible();
  await expect(page.getByRole("img", { name: "오른쪽 사진 패널 실제 위치" })).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/world-spatial-editor.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 780 });
  for (const side of ["left", "right"]) {
    const wall = page.locator(`[data-world-side="${side}"]`);
    await expect(wall.locator(".world-render")).toHaveCSS("width", "1300px");
    const viewport = wall.locator(".scene-viewport");
    const maxScroll = await viewport.evaluate(element => element.scrollWidth - element.clientWidth);
    await wall.getByRole("button", { name: side === "left" ? "왼쪽으로 이동" : "오른쪽으로 이동", exact: true }).click();
    await expect.poll(() => viewport.evaluate(element => Math.round(element.scrollLeft))).toBe(side === "left" ? 0 : maxScroll);
    await wall.getByRole("button", { name: side === "left" ? "오른쪽으로 이동" : "왼쪽으로 이동", exact: true }).click();
    const capture = JSON.parse(await readFile(`artifacts/world-${side}.json`, "utf8"));
    expect(capture.landmark.text).toBe("HAPPY BIRTHDAY");
    expect(capture.landmark.bounds.top).toBeGreaterThan(300);
    expect(capture.landmark.bounds.bottom).toBeLessThan(700);
    const stageScroll = await wall.locator(".world-render").evaluate((element, landmarkX) => {
      const center = landmarkX * element.clientWidth / 1600;
      return Math.round(Math.max(0, Math.min(center - element.parentElement!.clientWidth / 2, element.parentElement!.scrollWidth - element.parentElement!.clientWidth)));
    }, capture.landmark.x);
    await expect.poll(() => viewport.evaluate(element => Math.round(element.scrollLeft))).toBe(stageScroll);
    const scale = 1300 / 1600;
    expect(capture.landmark.bounds.left * scale - stageScroll).toBeGreaterThanOrEqual(0);
    expect(capture.landmark.bounds.right * scale - stageScroll).toBeLessThanOrEqual(await viewport.evaluate(element => element.clientWidth));
  }
  await page.screenshot({ path: "artifacts/screenshots/world-landmark-mobile.png", fullPage: true });
  await page.getByLabel("생일자의 이름").fill("서윤의 생일");
  const image = await sharp("public/world-spatial.webp").resize(640,360,{fit:"cover"}).png().toBuffer();
  const panels = page.locator(".scene-panel");
  expect(await panels.count()).toBe(8);
  for (let i = 0; i < 3; i++) {
    const chooser = page.waitForEvent("filechooser");
    await panels.nth(i).click();
    await (await chooser).setFiles({ name: "birthday.png", mimeType: "image/png", buffer: image });
    await expect(page.getByRole("status")).toHaveText("저장하지 않은 변경 사항");
  }
  for (const panel of await panels.all()) {
    const box = (await panel.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(95);
    expect(box.height).toBeGreaterThanOrEqual(55);
  }
  const save = page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true });
  await save.click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  const url = await page.getByLabel("VRChat용 이미지 링크", { exact: true }).inputValue();
  expect((await request.get(url)).status()).toBe(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.screenshot({ path: "artifacts/screenshots/redesign-editor-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const canvas = (await page.locator(".scene-workspace").boundingBox())!;
  const workspace = (await page.locator(".controller-workspace").boundingBox())!;
  expect(canvas.width).toBeGreaterThan(workspace.width * .98);
  await page.screenshot({ path: "artifacts/screenshots/redesign-editor-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "테마 전환", exact: true }).click();
  await page.screenshot({ path: "artifacts/screenshots/redesign-editor-dark.png", fullPage: true });
});

test("clicking measured world texture positions stores photos in the corresponding Unity panels", async ({ page, request }) => {
  const captures = {
    left: JSON.parse(await readFile("artifacts/world-left.json", "utf8")),
    right: JSON.parse(await readFile("artifacts/world-right.json", "utf8")),
  };
  const expected = [
    ["Hero portrait -1", "hero-left"], ["Hero portrait 1", "hero-right"],
    ["Memory -1 0", "memory-left-0"], ["Memory -1 1", "memory-left-1"], ["Memory -1 2", "memory-left-2"],
    ["Memory 1 0", "memory-right-0"], ["Memory 1 1", "memory-right-1"], ["Memory 1 2", "memory-right-2"],
  ];
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  await expect(page.locator(".scene-panel")).toHaveCount(8);
  const hashes: Record<string, string> = {};
  for (const [index, [objectName, id]] of expected.entries()) {
    const side = id.includes("left") ? "left" : "right";
    const measured = captures[side].panels.find((p: { name: string }) => p.name === objectName);
    const render = page.locator(`[data-world-side="${side}"] .world-render`);
    await render.scrollIntoViewIfNeeded();
    const image = (await render.boundingBox())!;
    const x = image.x + (measured.corners.reduce((sum: number, p: { x: number }) => sum + p.x, 0) / 4) * image.width / 1600;
    const y = image.y + (measured.corners.reduce((sum: number, p: { y: number }) => sum + p.y, 0) / 4 - 300) * image.height / 400;
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("data-world-object"), { x, y })).toBe(objectName);
    const buffer = await sharp({ create: { width: 160, height: 90, channels: 3, background: { r: 30 + index * 25, g: 100, b: 200 - index * 20 } } }).png().toBuffer();
    hashes[id] = createHash("sha256").update(buffer).digest("hex");
    const target = page.locator(`[data-panel-id="${id}"]`);
    const bounds = (await target.boundingBox())!;
    const chooser = page.waitForEvent("filechooser", { timeout: 10000 });
    await target.click({ position: { x: x - bounds.x, y: y - bounds.y } });
    await (await chooser).setFiles({ name: `${id}.png`, mimeType: "image/png", buffer });
    await expect(page.locator(`[data-panel-id="${id}"]`)).toHaveClass(/populated/);
    const removeBounds = (await page.getByRole("button", { name: `${id.includes("left") ? "L" : "R"}${id.startsWith("hero") ? 1 : Number(id.slice(-1)) + 2} 사진 제거`, exact: true }).boundingBox())!;
    expect(removeBounds.y).toBeGreaterThan(bounds.y + bounds.height);
    expect(removeBounds.width).toBeGreaterThanOrEqual(44);
    expect(removeBounds.y + removeBounds.height).toBeLessThanOrEqual(image.y + image.height);
  }
  await page.getByRole("button", { name: "저장하고 링크 만들기", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  const saved = await (await request.get(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } })).json();
  expect(saved.album.panels).toEqual(hashes);
  await page.screenshot({ path: "artifacts/screenshots/world-panel-mapping.png", fullPage: true });
});


