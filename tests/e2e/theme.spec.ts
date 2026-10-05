import { test, expect } from "@playwright/test";

test("system theme, manual override and reload persist across entry and editor", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass("dark");
  await page.getByRole("button", { name: "테마 전환", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass("dark");
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass("dark");
  await page.getByRole("button", { name: "테마 전환", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("background-color", "rgb(23, 20, 29)");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "새로 만들기" }).click();
  await expect(page.getByLabel("생일자의 이름")).toBeVisible();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.getByLabel("생일자의 이름").fill("멜비");
  await page.getByRole("button", { name: /변경 사항 저장|저장하고 링크 만들기/, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("모든 변경 사항 저장됨");
  await expect(page.getByRole("button", { name: "VRChat용 이미지 링크 복사", exact: true })).toBeEnabled();
  await page.screenshot({ path: "artifacts/screenshots/dark-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".controller-save")).toHaveCSS("background-color", "rgb(35, 29, 43)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: "artifacts/screenshots/dark-mobile.png" });
  expect(errors).toEqual([]);
});


