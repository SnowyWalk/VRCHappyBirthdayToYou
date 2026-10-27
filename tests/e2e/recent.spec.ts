import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { makeLink, nameField } from "./helpers";

test("recent links restore legacy tokens, retain the latest five and recover token lookup", async ({ page, request }) => {
  const records = [];
  const photo = await sharp({ create: { width: 160, height: 90, channels: 3, background: "#2587be" } }).png().toBuffer();
  for (let index = 0; index < 6; index++) {
    const { album, editToken } = await (await request.post("/api/albums")).json();
    const saved = await (await request.put(`/api/albums/${album.id}`, {
      headers: { Authorization: `Bearer ${editToken}` },
      multipart: {
        nickname: `최근 생일 ${index}`, revision: "0", remove: "[]",
        ...(index === 5 ? { "hero-left": { name: "recent.png", mimeType: "image/png", buffer: photo } } : {}),
      },
    })).json();
    records.push({ album: saved.album, editToken, dataUrl: saved.dataUrl });
  }
  await page.goto("/");
  await page.evaluate((items) => {
    for (const item of items) localStorage.setItem(`birthday-world:edit:${item.album.id}`, item.editToken);
  }, records);
  await page.reload();
  const recent = page.getByRole("region", { name: "이 브라우저에서 만든 링크", exact: true });
  const links = recent.getByRole("link");
  await expect(links).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    const record = records[5 - index];
    await expect(links.nth(index)).toContainText(record.album.nickname);
    await expect(links.nth(index)).toContainText(index === 0 ? "사진 1장" : "사진 0장");
    await expect(links.nth(index)).toContainText("방금 전");
    await expect(links.nth(index)).toHaveAttribute("href", `/edit/${record.album.id}#key=${record.editToken}`);
  }

  const last = records[5];
  await page.evaluate((id) => localStorage.removeItem(`birthday-world:edit:${id}`), last.album.id);
  await links.first().click();
  await expect(nameField(page)).toHaveValue(last.album.nickname);
  await nameField(page).fill("수정 완료");
  const url = await makeLink(page);
  await page.goto("/");
  await expect(links.first()).toContainText("수정 완료");

  await page.evaluate((id) => localStorage.removeItem(`birthday-world:edit:${id}`), last.album.id);
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  await page.getByLabel("월드에 붙여넣었던 링크").fill(url);
  await page.getByRole("dialog").getByRole("button", { name: "불러오기" }).click();
  await expect(nameField(page)).toHaveValue("수정 완료");
  await page.getByRole("button", { name: "사진 4 빼기", exact: true }).click();
  await makeLink(page);
  await page.goto("/");
  await expect(links.first()).toContainText("사진 0장");
});

test("visiting the page creates nothing until a link is made", async ({ page }) => {
  const creates: string[] = [];
  page.on("request", (req) => { if (req.method() === "POST" && req.url().endsWith("/api/albums")) creates.push(req.url()); });
  await page.goto("/");
  await nameField(page).fill("아직 저장 안 함");
  await page.reload();
  await expect(nameField(page)).toHaveValue("");
  await expect(page.getByRole("region", { name: "이 브라우저에서 만든 링크", exact: true })).toHaveCount(0);
  expect(creates).toEqual([]);
});
