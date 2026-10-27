import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { expectNoHorizontalOverflow, makeLink, makeLinkButton, nameField, panel } from "./helpers";

test("everything needed is on one screen at desktop and phone sizes with light images", async ({ page, request }) => {
  await page.goto("/");
  // Name, both walls and the link action fit a common laptop screen.
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const target of [nameField(page), page.locator('[data-world-side="left"]'), makeLinkButton(page)]) {
    const box = (await target.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(1000);
  }
  const images = page.locator(".wall-canvas > img, .name-sign img");
  await expect.poll(() => images.evaluateAll((all: HTMLImageElement[]) => all.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
  for (const src of await images.evaluateAll((all: HTMLImageElement[]) => all.map((img) => img.getAttribute("src")!))) {
    expect((await (await request.get(src)).body()).length).toBeLessThan(200 * 1024);
  }
  await page.screenshot({ path: "artifacts/screenshots/studio-empty-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 360, height: 780 });
  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".slot")).toHaveCount(8);
  const bar = (await makeLinkButton(page).boundingBox())!;
  expect(bar.y + bar.height).toBeLessThanOrEqual(780);
  // Zoomed walls keep every frame inside the screen.
  for (const id of ["memory-left-2", "hero-left", "hero-right", "memory-right-2"]) {
    const box = (await panel(page, id).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  }
  await page.screenshot({ path: "artifacts/screenshots/studio-empty-mobile.png", fullPage: true });
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
  await expect(page.locator(".panel")).toHaveCount(8);
  for (const [index, [objectName, id]] of expected.entries()) {
    const side = id.includes("left") ? "left" : "right";
    const measured = captures[side].panels.find((p: { name: string }) => p.name === objectName);
    const render = page.locator(`[data-world-side="${side}"] .wall-frame`);
    await render.scrollIntoViewIfNeeded();
    const image = (await render.boundingBox())!;
    const x = image.x + (measured.corners.reduce((sum: number, p: { x: number }) => sum + p.x, 0) / 4) * image.width / 1600;
    const y = image.y + (measured.corners.reduce((sum: number, p: { y: number }) => sum + p.y, 0) / 4 - 300) * image.height / 400;
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("data-world-object"), { x, y })).toBe(objectName);
    const buffer = await sharp({ create: { width: 160, height: 90, channels: 3, background: { r: 30 + index * 25, g: 100, b: 200 - index * 20 } } }).png().toBuffer();
    const target = panel(page, id);
    const bounds = (await target.boundingBox())!;
    const chooser = page.waitForEvent("filechooser", { timeout: 10000 });
    await target.click({ position: { x: x - bounds.x, y: y - bounds.y } });
    await (await chooser).setFiles({ name: `${id}.png`, mimeType: "image/png", buffer });
    await expect(target).toHaveClass(/filled/);
    await expect(page.locator(".panel-remove")).toHaveCount(index + 1);
  }
  await makeLink(page);
  const saved = await (await request.get(`/api/albums/${album.id}`, { headers: { Authorization: `Bearer ${editToken}` } })).json();
  const savedPanels = saved.album.panels as Record<string, string | null>;
  expect(Object.keys(savedPanels).filter((id) => savedPanels[id]).sort()).toEqual(expected.map(([, id]) => id).sort());
  expect(new Set(Object.values(savedPanels)).size).toBe(expected.length);
  await page.screenshot({ path: "artifacts/screenshots/world-panel-mapping.png", fullPage: true });
});
