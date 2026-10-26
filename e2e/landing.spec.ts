import { expect, test } from "@playwright/test";
import { PRESETS } from "../src/lib/templates";

test.describe("landing page", () => {
  test("tells the story: hero, steps, every template, honesty section and FAQ", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("right resume for every job");
    await expect(page.getByRole("heading", { name: "Three steps. No design skills." })).toBeVisible();
    await expect(page.getByRole("heading", { name: `${PRESETS.length} templates. All ATS-safe.` })).toBeVisible();
    await expect(page.getByRole("heading", { name: /will not make things up/ })).toBeVisible();
    // copy regression: "AI" must keep its capitals in the honesty list
    await expect(page.locator("#honesty")).toContainText("Never: send your contact details to an AI");
  });

  test("shows one live card per template, each linking to the builder with that template", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator('ul[aria-label="Resume templates"] > li a');
    await expect(cards).toHaveCount(PRESETS.length);
    for (const p of PRESETS) await expect(page.locator(`#templates a[href="/build?template=${p.id}"]`)).toContainText(p.name);
  });

  test("clicking a template starts the builder with it selected (and survives bad values)", async ({ page }) => {
    await page.goto("/");
    await page.locator('#templates a[href="/build?template=slate"]').click();
    await expect(page).toHaveURL(/\/build\?template=slate/);
    await page.getByRole("button", { name: "Load example" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Paste the job description").fill("Senior Frontend Engineer building React and TypeScript apps with Next.js and AWS.");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("radio", { name: /^Slate/ })).toHaveAttribute("aria-checked", "true");

    // unknown / hostile values are ignored, never applied
    await page.goto("/build?template=%3Cscript%3Ealert(1)%3C/script%3E");
    await expect(page.getByLabel("Full name")).toBeVisible();
  });

  test("FAQ items open and close", async ({ page }) => {
    await page.goto("/");
    const first = page.locator("#faq details").first();
    await expect(first).not.toHaveAttribute("open", "");
    await first.locator("summary").click();
    await expect(first).toHaveAttribute("open", "");
    await expect(first).toContainText("single column of real text");
  });

  test("works with JavaScript disabled (server-rendered, CSS-only animation)", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const list = page.locator('ul[aria-label="Resume templates"] > li');
    await expect(list).toHaveCount(PRESETS.length); // all of them are in the page...
    await expect(page.locator('ul[aria-label="Resume templates"] > li:not([hidden])')).toHaveCount(6); // ...six are shown
    // the button cannot work without JavaScript, so the plain link to the full list is what such a visitor uses
    await expect(page.getByRole("link", { name: "Compare them with descriptions" })).toHaveAttribute("href", "/ats-resume-templates");
    await ctx.close();
  });

  test("no horizontal scrolling at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("respects reduced motion: demo elements are visible immediately, not mid-animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const chip = page.getByText("92% keyword match");
    await expect(chip).toBeVisible();
    expect(await chip.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  });
});

test("export shows a confirmation the user can see and a screen reader announces", async ({ page }) => {
  await page.goto("/build");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Paste the job description").fill("Senior Frontend Engineer building React and TypeScript apps with Next.js and AWS.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Choose a template" })).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Plain text (.txt)" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.txt$/);
  await expect(page.getByRole("status").filter({ hasText: "Downloaded TXT" })).toContainText("✓");

});

test("the header has a way to the profile and to the quick resume", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: /Profile/ })).toBeVisible();
  await nav.getByRole("link", { name: /Profile/ }).click();
  await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 }); // the first visit to a page compiles it on the dev server
  await expect(page.getByRole("heading", { name: "Your profile, filled once" })).toBeVisible();
});

test.describe("the template section shows six, with a button for the rest", () => {
  const cards = (page: import("@playwright/test").Page) => page.locator('ul[aria-label="Resume templates"] > li');
  const visibleCards = (page: import("@playwright/test").Page) => page.locator('ul[aria-label="Resume templates"] > li:not([hidden])');

  test("starts with six templates and 'View all 23 templates'", async ({ page }) => {
    await page.goto("/");
    await expect(visibleCards(page)).toHaveCount(6);
    const btn = page.getByRole("button", { name: `View all ${PRESETS.length} templates` });
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    // the heading still says how many there are
    await expect(page.getByRole("heading", { name: `${PRESETS.length} templates. All ATS-safe.` })).toBeVisible();
  });

  test("the six are a spread of looks, not just the first six in the list", async ({ page }) => {
    await page.goto("/");
    const names = await visibleCards(page).locator("p.font-display").allTextContents();
    expect(names).toEqual(["Classic", "Modern", "Horizon", "Executive", "Slate", "Scholar"]);
  });

  test("the button reveals every template, and 'Show fewer' hides them again", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: `View all ${PRESETS.length} templates` }).click();
    await expect(visibleCards(page)).toHaveCount(PRESETS.length);
    const btn = page.getByRole("button", { name: "Show fewer templates" });
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    // a revealed card really can be used
    await page.locator('#templates a[href="/build?template=sprint"]').click();
    await expect(page).toHaveURL(/template=sprint/);
    await page.goBack();
    await page.getByRole("button", { name: `View all ${PRESETS.length} templates` }).click();
    await page.getByRole("button", { name: "Show fewer templates" }).click();
    await expect(visibleCards(page)).toHaveCount(6);
  });

  test("the hidden templates are still in the page for search engines, and a plain link to the full list is always there", async ({ page, request }) => {
    const html = await (await request.get("/")).text();
    for (const p of PRESETS) expect(html, p.name).toContain(`/build?template=${p.id}`);
    await page.goto("/");
    await expect(cards(page)).toHaveCount(PRESETS.length);
    await expect(page.getByRole("link", { name: "Compare them with descriptions" })).toHaveAttribute("href", "/ats-resume-templates");
  });

  test("it works with the keyboard, and hidden cards cannot be tabbed to", async ({ page }) => {
    await page.goto("/");
    const hiddenLink = page.locator('#templates a[href="/build?template=sprint"]');
    await expect(hiddenLink).toBeHidden();
    const btn = page.getByRole("button", { name: `View all ${PRESETS.length} templates` });
    await btn.focus();
    await page.keyboard.press("Enter");
    await expect(hiddenLink).toBeVisible();
    await expect(page.getByRole("button", { name: "Show fewer templates" })).toBeFocused(); // focus stays on the button
  });

  test("on a phone: a two-column grid of six, a full-size tap target, nothing sideways, before and after opening", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    const btn = page.getByRole("button", { name: `View all ${PRESETS.length} templates` });
    expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await btn.click();
    await expect(visibleCards(page)).toHaveCount(PRESETS.length);
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
