import { expect, test } from "@playwright/test";

test.describe("profile: save status and preview", () => {
  test("the save bar says what is happening, Save now works, and the data survives a reload", async ({ page }) => {
    await page.goto("/profile");
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    const status = page.getByTestId("save-status");
    await expect(status).toContainText("Nothing to save yet");
    await page.getByLabel("Full name").fill("Asha Rao");
    await expect(status).toContainText(/Saving…|Saved in this browser/);
    await page.getByRole("button", { name: "Save now" }).click();
    await expect(status).toContainText("Saved in this browser");
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");
  });

  test("signed in, the save bar says it is saved to the account", async ({ page }) => {
    await page.goto("/profile");
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.getByLabel("Full name").fill("Asha Rao");
    await page.getByRole("link", { name: "Sign in", exact: true }).first().click();
    await page.getByLabel("Email address").fill(`save-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 });
    await expect(page.getByTestId("save-status")).toContainText("Saved to your account", { timeout: 20_000 });
  });

  test("the save bar stays in view while scrolling a long page", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: "Load example" }).click();
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(page.getByRole("button", { name: "Save now" })).toBeInViewport();
  });

  test("the preview shows the profile in the chosen template and changes with the template", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: "Load example" }).click();
    await expect(page.getByLabel("Resume preview")).toHaveCount(0); // not loaded until asked for
    await page.getByRole("button", { name: "Show my resume preview" }).click();
    const paper = page.getByLabel("Resume preview");
    await expect(paper).toBeVisible();
    const name = await page.getByLabel("Full name").inputValue();
    await expect(paper).toContainText(name);
    const before = await paper.evaluate((el) => getComputedStyle(el).fontFamily);
    const sel = page.getByLabel("Template");
    const options = await sel.locator("option").evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    expect(options.length).toBeGreaterThan(3);
    let changed = false;
    for (const v of options.slice(1)) {
      await sel.selectOption(v);
      if ((await paper.evaluate((el) => getComputedStyle(el).fontFamily)) !== before) { changed = true; break; }
    }
    expect(changed).toBe(true);
    // editing a field updates the preview at once
    await page.getByLabel("Full name").fill("Zed Quill");
    await expect(paper).toContainText("Zed Quill");
    await page.getByRole("button", { name: "Hide preview" }).click();
    await expect(page.getByLabel("Resume preview")).toHaveCount(0);
  });

  for (const width of [320, 390]) {
    test(`no sideways scrolling at ${width}px with the preview open`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/profile");
      await page.getByRole("button", { name: "Load example" }).click();
      await page.getByRole("button", { name: "Show my resume preview" }).click();
      await expect(page.getByLabel("Resume preview")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
});
