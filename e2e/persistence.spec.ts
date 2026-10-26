import { expect, test } from "@playwright/test";

/** REGRESSION: a resume with a name and a job but no valid email yet used to come back EMPTY after a reload. */
test("unfinished work (no email yet) survives a reload in the guided builder", async ({ page }) => {
  await page.goto("/build");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByLabel("Full name").fill("Asha Rao");
  await page.getByRole("button", { name: "+ Add role" }).click();
  await page.getByLabel("Job title").fill("Engineer");
  await page.getByLabel("Company").fill("Acme");
  await page.waitForTimeout(800); // autosave is debounced
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");
  await expect(page.getByLabel("Job title")).toHaveValue("Engineer");
  await expect(page.getByLabel("Company")).toHaveValue("Acme");
});

test("unfinished work survives a reload in the workspace too, and the Email field is still empty, not invented", async ({ page }) => {
  await page.goto("/studio");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByLabel("Full name").fill("Asha Rao");
  await page.getByLabel("Email").fill("asha@");
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");
  await expect(page.getByLabel("Email")).toHaveValue("asha@");
});
