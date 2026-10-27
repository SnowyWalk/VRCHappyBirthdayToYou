import { expect, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

export type TestImage = { name: string; mimeType: string; buffer: Buffer };

export async function makeImage(width: number, height: number, color: string, name: string): Promise<TestImage> {
  const jpeg = name.endsWith(".jpg");
  return {
    name,
    mimeType: jpeg ? "image/jpeg" : "image/png",
    buffer: await sharp({ create: { width, height, channels: 3, background: color } })
      .toFormat(jpeg ? "jpeg" : "png")
      .toBuffer(),
  };
}

export const landscapeImage = await makeImage(160, 90, "#c94b6d", "landscape.png");
export const portraitImage = await makeImage(90, 160, "#5074d8", "portrait.jpg");
export const squareImage = await makeImage(120, 120, "#777777", "square.png");

export const nameField = (page: Page) => page.getByRole("textbox", { name: "생일자 이름" });
export const status = (page: Page) => page.locator(".action-status");
export const makeLinkButton = (page: Page) => page.getByRole("button", { name: /^(새 )?링크 만들기$/ });
export const copyButton = (page: Page) => page.locator(".primary-action");
export const panel = (page: Page, id: string) => page.locator(`.panel[data-panel-id="${id}"]`);
export const linkDialog = (page: Page) => page.getByRole("dialog", { name: /링크/ });

/** Opens the picker from `trigger`, selects `file` and waits for the preview. */
export async function chooseFile(page: Page, trigger: Locator, file: string | TestImage = landscapeImage) {
  const chooser = page.waitForEvent("filechooser");
  await trigger.click();
  await (await chooser).setFiles(file);
  await expect(status(page)).toHaveText(/^사진 \d장 준비됨$|^바뀐 내용이 있어요$/);
}

/** Saves, returns the published world link and closes the link dialog. */
export async function makeLink(page: Page) {
  await makeLinkButton(page).click();
  const dialog = linkDialog(page);
  await expect(dialog).toBeVisible();
  await expect(status(page)).toContainText("링크 준비됨");
  const url = await dialog.getByLabel("월드에 붙여넣을 링크").inputValue();
  await dialog.getByRole("button", { name: "확인", exact: true }).click();
  await expect(dialog).toBeHidden();
  return url;
}

export function editIdFrom(page: Page) {
  return new URL(page.url()).pathname.split("/").pop()!;
}

export async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
