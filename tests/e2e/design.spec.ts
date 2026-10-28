import { test, expect } from "@playwright/test";
import { actionBar, expectNoHorizontalOverflow, landscapeImage, makeLink, nameField, panel, portraitImage, status } from "./helpers";
import worldMap from "../../src/lib/world-view.json" with { type: "json" };

test("everything needed is on one screen at desktop and phone sizes with light images", async ({ page, request }) => {
  await page.goto("/");
  // Name, the world map and the link action (the bar while part 3 is below) fit a common laptop screen.
  await page.setViewportSize({ width: 1440, height: 1000 });
  const barButton = actionBar(page).getByRole("button", { name: "링크 만들기" });
  await expect(barButton).toBeVisible();
  for (const target of [nameField(page), page.locator(".map-frame"), barButton]) {
    const box = (await target.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(1000);
  }
  const images = page.locator(".map-canvas > img, .name-sign img");
  await expect.poll(() => images.evaluateAll((all: HTMLImageElement[]) => all.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
  for (const src of await page.locator(".map-canvas > img, .name-sign img, .board-image img").evaluateAll((all: HTMLImageElement[]) => all.map((img) => img.getAttribute("src")!))) {
    expect((await (await request.get(src)).body()).length).toBeLessThan(200 * 1024);
  }
  await page.screenshot({ path: "artifacts/screenshots/studio-empty-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 360, height: 780 });
  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".slot")).toHaveCount(8);
  await expect(barButton).toBeVisible();
  const bar = (await barButton.boundingBox())!;
  expect(bar.y + bar.height).toBeLessThanOrEqual(780);
  // The map keeps every frame inside the screen.
  for (const id of ["memory-left-2", "hero-left", "hero-right", "memory-right-2"]) {
    const box = (await panel(page, id).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  }
  await page.screenshot({ path: "artifacts/screenshots/studio-empty-mobile.png", fullPage: true });
});

test("numbered cards sit on the measured frames and several photos fill them in number order", async ({ page, request }) => {
  const objectOf: Record<string, string> = {
    "hero-left": "Hero portrait -1", "hero-right": "Hero portrait 1",
    "memory-left-0": "Memory -1 0", "memory-right-0": "Memory 1 0",
    "memory-left-1": "Memory -1 1", "memory-right-1": "Memory 1 1",
    "memory-left-2": "Memory -1 2", "memory-right-2": "Memory 1 2",
  };
  const { album, editToken } = await (await request.post("/api/albums")).json();
  await page.goto(`/edit/${album.id}#key=${editToken}`);
  const map = (await page.locator(".map-frame").boundingBox())!;
  const scale = map.width / worldMap.width;
  // Pairs nearest the stage come first, left before right.
  for (const [index, id] of Object.keys(objectOf).entries()) {
    const card = panel(page, id);
    await expect(card).toHaveAccessibleName(`사진 ${index + 1} 넣기`);
    const measured = worldMap.panels.find((p) => p.name === objectOf[id])!;
    const box = (await card.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - (map.x + measured.x * scale))).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - (map.y + measured.y * scale))).toBeLessThan(2);
  }
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "여러 장 한 번에 넣기" }).click();
  await (await chooser).setFiles([landscapeImage, portraitImage, { ...landscapeImage, name: "third.png" }]);
  await expect(status(page)).toHaveText("사진 3장 준비됨");
  // A portrait photo turns its card upright, like the frame in the world.
  const upright = (await panel(page, "hero-right").boundingBox())!;
  expect(upright.height).toBeGreaterThan(upright.width);
  await page.screenshot({ path: "artifacts/screenshots/world-map.png", fullPage: true });
  await makeLink(page);
  const saved = await (await request.get(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } })).json();
  expect(saved.album.panelOrientations).toEqual({ "hero-left": "landscape", "hero-right": "portrait", "memory-left-0": "landscape" });
  await request.delete(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } });
});
