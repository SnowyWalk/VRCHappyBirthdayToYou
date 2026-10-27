import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { chooseFile, editIdFrom, makeLink, nameField, panel } from "./helpers";

async function createSaved(page: Page, name: string) {
  await page.goto("/");
  await nameField(page).fill(name);
  const photo = await sharp(randomBytes(160 * 90 * 3), { raw: { width: 160, height: 90, channels: 3 } }).png().toBuffer();
  await chooseFile(page, panel(page, "hero-left"), { name: "delete-test.png", mimeType: "image/png", buffer: photo });
  const url = await makeLink(page);
  return { id: editIdFrom(page), url };
}

test("recent and editor deletion require confirmation and invalidate server links", async ({ page, request }) => {
  const recent = page.getByRole("region", { name: "이 브라우저에서 만든 링크", exact: true });
  const first = await createSaved(page, "목록에서 삭제");
  await page.goto("/");
  const recentDelete = recent.getByRole("button", { name: "목록에서 삭제 삭제", exact: true });
  await expect(recentDelete).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await recentDelete.click();
  expect((await request.get(`/data/${first.id}`)).status()).toBe(200);
  page.once("dialog", (dialog) => dialog.accept());
  await recentDelete.click();
  await expect(recent).toHaveCount(0);
  expect((await request.get(`/data/${first.id}`)).status()).toBe(404);
  expect((await request.get(first.url)).status()).toBe(404);

  const second = await createSaved(page, "편집기에서 삭제");
  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "사진과 링크 삭제", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(recent).toHaveCount(0);
  expect((await request.get(`/data/${second.id}`)).status()).toBe(404);
  expect((await request.get(second.url)).status()).toBe(404);
});

test("an expiring recent link disappears without reloading the page", async ({ page, request }) => {
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto("/");
  await page.evaluate(([id, token]) => localStorage.setItem(`birthday-world:edit:${id}`, token), [album.id, editToken]);
  await page.reload();
  const region = page.getByRole("region", { name: "이 브라우저에서 만든 링크", exact: true });
  await expect(region.getByRole("link")).toHaveCount(1);
  await page.evaluate(() => {
    const key = "birthday-world:recent-albums";
    const records = JSON.parse(localStorage.getItem(key)!);
    records[0].expiresAt = new Date(Date.now() + 1500).toISOString();
    localStorage.setItem(key, JSON.stringify(records));
  });
  await expect(region).toHaveCount(0, { timeout: 10000 });
});
