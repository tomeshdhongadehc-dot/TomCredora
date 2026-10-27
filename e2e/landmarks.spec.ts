import { expect, test } from "@playwright/test";

/** "Skip to content" jumps to #main; a page without it leaves keyboard and screen-reader users with a dead link. */
const PAGES = ["/", "/build", "/quick", "/studio", "/profile", "/signin", "/signup", "/ats-resume-templates", "/guides/ats-friendly-resume", "/privacy", "/terms", "/nope-404"];

for (const path of PAGES) {
  test(`${path} has one main landmark that the skip link reaches`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("main#main")).toHaveCount(1);
    await page.getByRole("link", { name: "Skip to content" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
}
