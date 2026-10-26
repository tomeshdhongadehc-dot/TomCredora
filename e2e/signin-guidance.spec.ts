import { expect, test, type Page } from "@playwright/test";

/** The guidance around signing in, for someone who has never done it: explanation, shortcuts and gentle prompts. */
const email = (page: Page) => page.getByLabel("Email address");
const sendLink = (page: Page) => page.getByRole("button", { name: "Sign in", exact: true });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function fresh(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
}

async function toExport(page: Page) {
  await fresh(page, "/build");
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Paste the job description").fill("Senior Frontend Engineer building React and TypeScript apps with Next.js and AWS.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Choose a template" })).toBeVisible();
}
const download = async (page: Page) => {
  await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Plain text (.txt)" }).click()]);
};

test.describe("the sign-in page explains itself", () => {
  test("three plain steps, the benefits and 'no password' are visible before anything is typed", async ({ page }) => {
    await fresh(page, "/signin?next=%2Fprofile");
    const steps = page.getByRole("list", { name: "How signing in works" }).getByRole("listitem");
    await expect(steps).toHaveText([/Enter your email/, /Open the email we send/, /Click the link/]);
    await expect(page.getByRole("main")).toContainText("No password to remember");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("steps and benefit pills fit the narrowest phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await fresh(page, "/signin?next=%2Fprofile");
    await expect(page.getByRole("list", { name: "How signing in works" })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("waiting for the emailed link", () => {
  test("a Gmail address gets an 'Open Gmail' button; an unknown provider does not get a guess", async ({ page }) => {
    await fresh(page, "/signin?next=%2Fprofile");
    await email(page).fill("meera+link@gmail.com");
    await sendLink(page).click();
    const open = page.getByRole("link", { name: "Open Gmail" });
    await expect(open).toHaveAttribute("href", "https://mail.google.com/");
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", /noopener/);
    await expect(page.getByRole("main")).toContainText("Spam or Promotions");

    await page.getByRole("button", { name: "Use a different email" }).click();
    await email(page).fill("meera+link@some-small-company.example");
    await sendLink(page).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
    await expect(page.getByRole("link", { name: /^Open / })).toHaveCount(0);
  });

  test("clicking the link in another tab signs this tab in and moves it on by itself", async ({ page, context }) => {
    await fresh(page, "/signin?next=%2Fprofile");
    await email(page).fill("meera+link@example.com");
    await sendLink(page).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
    // what the emailed link does in the other tab: it stores the session
    const other = await context.newPage();
    await other.goto("/signin");
    await other.evaluate(() => localStorage.setItem("arb.mockauth", JSON.stringify({ email: "meera+link@example.com", token: "mock.meera.x" })));
    await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 });
  });
});

test.describe("coming back", () => {
  test("the address used last time is offered as one tap, and a different one can still be typed", async ({ page, context }) => {
    await fresh(page, "/signin?next=%2Fprofile");
    await email(page).fill("meera+link@example.com");
    await sendLink(page).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");

    const again = await context.newPage(); // a new tab: nothing typed yet, but the device remembers the address
    await again.goto("/signin?next=%2Fprofile");
    await expect(again.getByText("Welcome back")).toBeVisible();
    await expect(again.getByRole("main")).toContainText("meera+link@example.com");
    await again.getByRole("button", { name: "Send the link to this address" }).click();
    await expect(again.getByRole("heading", { level: 1 })).toHaveText("Check your email");

    const third = await context.newPage();
    await third.goto("/signin");
    await third.getByLabel("Email address").fill("other@example.com");
    await expect(third.getByText("Welcome back")).toHaveCount(0); // typing a different address replaces the shortcut
  });

  test("a first-time visitor sees no 'Welcome back'", async ({ page }) => {
    await fresh(page, "/signin");
    await expect(page.getByText("Welcome back")).toHaveCount(0);
  });
});

test.describe("gentle prompts to sign in", () => {
  test("after a download, a short offer appears; it goes to sign-in and comes back here; 'Not now' hides it for good", async ({ page }) => {
    await toExport(page);
    const offer = page.getByRole("region", { name: "Save your work" });
    await expect(offer).toHaveCount(0); // not before they have anything to keep
    await download(page);
    await expect(offer).toContainText("Keep this resume safe");
    await expect(offer.getByRole("link", { name: "Save to my account" })).toHaveAttribute("href", /\/signin\?next=%2Fbuild/);

    await offer.getByRole("button", { name: "Not now" }).click();
    await expect(offer).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Choose a template" })).toBeVisible(); // the step survives a reload
    await download(page);
    await expect(page.getByRole("region", { name: "Save your work" })).toHaveCount(0);
  });

  test("it fits a narrow phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await toExport(page);
    await download(page);
    const offer = page.getByRole("region", { name: "Save your work" });
    await expect(offer).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    for (const b of await offer.locator("a, button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("the workspace says 'Saved in this browser only' with a way to sign in", async ({ page, isMobile }) => {
    await fresh(page, "/studio");
    if (isMobile) await page.getByRole("tab", { name: "Content" }).click();
    const note = page.getByText("Saved in this browser only.");
    await expect(note).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in to keep it safe" })).toHaveAttribute("href", /\/signin\?next=%2Fstudio/);
  });

  test("the profile page offers it once there is something to lose", async ({ page }) => {
    await fresh(page, "/profile");
    const offer = page.getByRole("region", { name: "Save your work" });
    await expect(offer).toHaveCount(0);
    await page.getByLabel("Full name").fill("Asha Rao");
    await expect(offer).toContainText("Do not lose your profile");
  });

  test("a signed-in person sees none of it", async ({ page }) => {
    await fresh(page, "/signin?next=%2Fstudio");
    await email(page).fill("asha@example.com");
    await sendLink(page).click();
    await expect(page).toHaveURL(/\/studio$/, { timeout: 20_000 });
    await expect(page.getByText("Saved in this browser only.")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Save your work" })).toHaveCount(0);
  });
});
