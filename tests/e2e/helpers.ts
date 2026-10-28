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
/** Status line of the bottom bar (kept in the DOM while the bar is hidden). */
export const status = (page: Page) => page.locator(".action-status");
export const linkCard = (page: Page) => page.locator(".link-card");
export const makeLinkButton = (page: Page) => linkCard(page).getByRole("button", { name: /^(새 )?링크 만들기$/ });
export const copyButton = (page: Page) => page.locator("#copy-link");
export const linkField = (page: Page) => page.getByLabel("월드에 붙여넣을 링크");
export const actionBar = (page: Page) => page.locator(".action-bar");
export const panel = (page: Page, id: string) => page.locator(`.panel[data-panel-id="${id}"]`);

/** Opens the picker from `trigger`, selects `file` and waits for the preview. */
export async function chooseFile(page: Page, trigger: Locator, file: string | TestImage = landscapeImage) {
  const chooser = page.waitForEvent("filechooser");
  await trigger.click();
  await (await chooser).setFiles(file);
  await expect(status(page)).toHaveText(/^사진 \d장 준비됨$|^바뀐 내용이 있어요$/);
}

/** Saves from part 3 and returns the published world link. */
export async function makeLink(page: Page) {
  await makeLinkButton(page).click();
  await expect(status(page)).toContainText("링크 준비됨");
  await expect(copyButton(page)).toHaveText("링크 복사");
  return linkField(page).inputValue();
}

export function editIdFrom(page: Page) {
  return new URL(page.url()).pathname.split("/").pop()!;
}

export async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
