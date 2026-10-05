import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { randomBytes } from "node:crypto";

test("recent and editor deletion require confirmation and invalidate server links", async ({ page, request }) => {
  async function createSaved(name: string) {
    await page.goto("/");
    await page.getByRole("button", { name: "새로 만들기", exact: true }).click();
    await expect(page.getByLabel("생일자의 이름")).toBeVisible();
    await expect(page.locator(".gallery-empty-note")).toHaveText("사진을 넣지 않은 패널은 월드에서 자동으로 제거됩니다.");
    const id = new URL(page.url()).pathname.split("/").pop()!;
    await page.getByLabel("생일자의 이름").fill(name);
    const photo = await sharp(randomBytes(160 * 90 * 3), { raw: { width: 160, height: 90, channels: 3 } }).png().toBuffer();
    const chooser = page.waitForEvent("filechooser");
    await page.locator('[data-panel-id="hero-left"]').click();
    await (await chooser).setFiles({ name: "delete-test.png", mimeType: "image/png", buffer: photo });
    await expect(page.locator('[data-panel-id="hero-left"]')).toHaveClass(/populated/);
    await page.getByRole("button", { name: "저장하고 링크 만들기", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
    return { id, url: await page.getByLabel("VRChat용 이미지 링크", { exact: true }).inputValue() };
  }
  const first = await createSaved("목록에서 삭제");
  await page.goto("/");
  const recentDelete = page.getByRole("button", { name: "목록에서 삭제 앨범 삭제", exact: true });
  await expect(recentDelete).toBeVisible();
  page.once("dialog", dialog => dialog.dismiss());
  await recentDelete.click();
  expect((await request.get(`/data/${first.id}`)).status()).toBe(200);
  page.once("dialog", dialog => dialog.accept());
  await recentDelete.click();
  await expect(page.getByRole("region", { name: "최근 편집 링크", exact: true })).toHaveCount(0);
  expect((await request.get(`/data/${first.id}`)).status()).toBe(404);
  expect((await request.get(first.url)).status()).toBe(404);
  const second = await createSaved("편집기에서 삭제");
  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "앨범 삭제", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("region", { name: "최근 편집 링크", exact: true })).toHaveCount(0);
  expect((await request.get(`/data/${second.id}`)).status()).toBe(404);
  expect((await request.get(second.url)).status()).toBe(404);
});

test("an expiring recent link disappears without reloading the page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "새로 만들기", exact: true }).click();
  await expect(page.getByLabel("생일자의 이름")).toBeVisible();
  await page.goto("/");
  const region = page.getByRole("region", { name: "최근 편집 링크", exact: true });
  await expect(region.getByRole("link")).toHaveCount(1);
  await page.evaluate(() => {
    const key = "birthday-world:recent-albums";
    const records = JSON.parse(localStorage.getItem(key)!);
    records[0].expiresAt = new Date(Date.now() + 1500).toISOString();
    localStorage.setItem(key, JSON.stringify(records));
  });
  await expect(region).toHaveCount(0, { timeout: 5000 });
});
