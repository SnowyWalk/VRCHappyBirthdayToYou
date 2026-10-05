import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("recent links restore legacy tokens, retain the latest five issuances and recover token lookup", async ({ page, request }) => {
  const records = [];
  const photo = await sharp({ create: { width: 160, height: 90, channels: 3, background: "#2587be" } }).png().toBuffer();
  for (let index = 0; index < 6; index++) {
    const { album, editToken } = await (await request.post("/api/albums")).json();
    const saved = await (await request.put(`/api/albums/${album.id}`, {
      headers: { Authorization: `Bearer ${editToken}` },
      multipart: { nickname: `최근 생일 ${index}`, revision: "0", remove: "[]",
        ...(index === 5 ? { "hero-left": { name: "recent.png", mimeType: "image/png", buffer: photo } } : {}) },
    })).json();
    records.push({ album: saved.album, editToken, dataUrl: saved.dataUrl });
  }
  await page.goto("/");
  await page.evaluate(items => {
    for (const item of items) localStorage.setItem(`birthday-world:edit:${item.album.id}`, item.editToken);
  }, records);
  await page.reload();
  const recent = page.getByRole("region", { name: "최근 편집 링크", exact: true });
  await expect(recent.getByRole("link")).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    const record = records[5 - index];
    await expect(recent.getByRole("link").nth(index)).toContainText(record.album.nickname);
    await expect(recent.getByRole("link").nth(index).locator(".recent-photo-count")).toHaveText(index === 0 ? "(1/8)" : "(0/8)");
    await expect(recent.getByRole("link").nth(index)).toHaveAttribute("href", `/edit/${record.album.id}#key=${record.editToken}`);
    await expect(recent.locator("time").nth(index)).toHaveAttribute("datetime", record.album.updatedAt);
    await expect(recent.locator("time").nth(index)).toHaveText("방금 전");
    await expect(recent.locator("time").nth(index)).toHaveAttribute("title", /\d{4}.*\d.*시.*분.*초/);
  }
  const last = records[5];
  await page.evaluate(id => localStorage.removeItem(`birthday-world:edit:${id}`), last.album.id);
  await recent.getByRole("link").first().click();
  await expect(page.getByLabel("생일자의 이름")).toHaveValue(last.album.nickname);
  await page.getByLabel("생일자의 이름").fill("수정 완료");
  await page.getByRole("button", { name: "변경 사항 저장", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  const url = await page.getByLabel("VRChat용 이미지 링크", { exact: true }).inputValue();
  await page.goto("/");
  await expect(recent.getByRole("link").first()).toContainText("수정 완료");
  await page.evaluate(id => localStorage.removeItem(`birthday-world:edit:${id}`), last.album.id);
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await page.getByLabel("앨범 링크 또는 UUID").fill(url);
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await expect(page.getByLabel("생일자의 이름")).toHaveValue("수정 완료");
  await page.getByRole("button", { name: "L1 사진 제거", exact: true }).click();
  await page.getByRole("button", { name: "변경 사항 저장", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  await page.goto("/");
  await expect(recent.getByRole("link").first().locator(".recent-photo-count")).toHaveText("(0/8)");
});

test("new draft appears as an editable recent issuance without pretending it was saved", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "새로 만들기", exact: true }).click();
  await expect(page.getByLabel("생일자의 이름")).toBeVisible();
  const edit = page.url();
  await page.goto("/");
  const recent = page.getByRole("region", { name: "최근 편집 링크", exact: true });
  await expect(recent.getByRole("link")).toHaveCount(1);
  await expect(recent.getByRole("link").locator(".recent-photo-count")).toHaveText("(0/8)");
  await expect(recent.getByRole("link").locator(".recent-name")).toHaveText("(이름 없음)");
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(recent.locator(".recent-photo-count")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await expect(recent).toContainText("아직 저장하지 않음");
  await recent.getByRole("link").click();
  await expect(page).toHaveURL(edit);
  await expect(page.getByLabel("생일자의 이름")).toBeVisible();
});
