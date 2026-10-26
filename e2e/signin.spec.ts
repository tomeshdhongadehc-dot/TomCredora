import { expect, test, type Page } from "@playwright/test";

/** The sign-in page (test-only fake sign-in: any address signs in at once; "name+link@..." waits for an emailed link). */
const unique = () => `u${Math.random().toString(36).slice(2, 8)}@example.com`;

async function open(page: Page, query = "?next=%2Fprofile") {
  await page.goto(`/signin${query}`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
const email = (page: Page) => page.getByLabel("Email address");
/** Our own message (Next also keeps an empty, invisible route announcer with the alert role). */
const alertBox = (page: Page) => page.getByRole("alert").filter({ hasText: /\S/ });
const submit = (page: Page) => page.getByRole("button", { name: "Sign in", exact: true });

test.describe("the sign-in form", () => {
  test("has one clear heading, a labelled email field, and a way out for people who do not want an account", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to save your work");
    await expect(email(page)).toHaveAttribute("type", "email");
    await expect(email(page)).toHaveAttribute("autocomplete", "email");
    await expect(email(page)).toHaveAttribute("inputmode", "email");
    await expect(page.getByRole("link", { name: "Continue without an account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Why sign in" })).toContainText("No password");
  });

  test("an empty or malformed address gets a clear message next to the field, and focus goes back to it", async ({ page }) => {
    await open(page);
    await submit(page).click();
    await expect(alertBox(page)).toContainText("Enter your email address");
    await expect(email(page)).toBeFocused();
    await expect(email(page)).toHaveAttribute("aria-invalid", "true");
    await email(page).fill("meera@");
    await submit(page).click();
    await expect(alertBox(page)).toContainText("does not look like an email");
    await email(page).fill("meera@example.com"); // typing clears the message
    await expect(alertBox(page)).toHaveCount(0);
    await expect(email(page)).not.toHaveAttribute("aria-invalid", "true");
  });

  test("pressing Enter submits, and signing in returns to the page you came from", async ({ page }) => {
    await open(page, "?next=%2Fquick");
    await email(page).fill(unique());
    await email(page).press("Enter");
    await expect(page).toHaveURL(/\/quick$/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Account:/ })).toBeVisible();
  });

  test("with no ?next it goes to the profile", async ({ page }) => {
    await open(page, "");
    await email(page).fill(unique());
    await submit(page).click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 });
  });

  test("a hostile ?next can never send you to another site", async ({ page }) => {
    for (const bad of ["https://evil.example/steal", "//evil.example", "%2F%2Fevil.example", "javascript:alert(1)", "%2Fsignin%3Fnext%3D%2Fsignin"]) {
      await open(page, `?next=${bad}`);
      await email(page).fill(unique());
      await submit(page).click();
      await expect(page).toHaveURL(/localhost:\d+\/profile$/, { timeout: 20_000 });
      expect(new URL(page.url()).origin).toBe(new URL(test.info().project.use.baseURL as string).origin);
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    }
  });

  test("what you typed in the email box is still there after a reload", async ({ page }) => {
    await open(page);
    await email(page).fill("meera@exam");
    await page.reload();
    await expect(email(page)).toHaveValue("meera@exam");
  });

  test("the continue-without-an-account link goes where you were headed", async ({ page }) => {
    await open(page, "?next=%2Fstudio");
    await page.getByRole("link", { name: "Continue without an account" }).click();
    await expect(page).toHaveURL(/\/studio$/, { timeout: 20_000 });
  });
});

test.describe("waiting for the emailed link", () => {
  async function toSent(page: Page, address = "meera+link@example.com") {
    await open(page);
    await email(page).fill(address);
    await submit(page).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
  }

  test("says where the link went, how to find it, and that you are not signed in yet", async ({ page }) => {
    await toSent(page);
    await expect(page.getByRole("main")).toContainText("meera+link@example.com");
    await expect(page.getByRole("main")).toContainText("this device");
    await expect(page.getByRole("main")).toContainText("spam");
    await expect(page.getByRole("button", { name: /Account:/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused(); // keyboard and screen-reader users land on the new heading
  });

  test("the resend button counts down before it can be used again", async ({ page }) => {
    await toSent(page);
    const resend = page.getByRole("button", { name: /Send it again in \d+s/ });
    await expect(resend).toBeDisabled();
    await expect(page.getByRole("button", { name: /Send it again in (2\d|30)s/ })).toBeVisible();
  });

  test("'Use a different email' returns to the form with the address still there to edit", async ({ page }) => {
    await toSent(page);
    await page.getByRole("button", { name: "Use a different email" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to save your work");
    await expect(email(page)).toHaveValue("meera+link@example.com");
  });
});

test.describe("coming back to the page", () => {
  test("an expired or used link shows a clear message and the form to ask for a new one", async ({ page }) => {
    await page.goto("/signin?next=%2Fprofile#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    await expect(alertBox(page)).toContainText("expired or was already used");
    await expect(email(page)).toBeVisible();
  });

  test("opened while already signed in, it shows the account instead of the form, and offers sign out", async ({ page }) => {
    await open(page, "");
    await email(page).fill(unique());
    await submit(page).click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 });
    await page.goto("/signin");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("You are signed in");
    await expect(email(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Go to my profile" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to save your work");
  });
});

test.describe("on a phone", () => {
  test("the form comes first, fields are 16px or larger (no iPhone zoom), buttons are at least 44px tall, and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page);
    const box = await email(page).boundingBox();
    const btn = await submit(page).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(btn!.height).toBeGreaterThanOrEqual(44);
    expect(await email(page).evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    // the form is above the benefits, and the whole form is visible without scrolling on a small phone
    const aside = await page.getByRole("complementary", { name: "Why sign in" }).boundingBox();
    expect(aside!.y).toBeGreaterThan(btn!.y);
    expect(btn!.y + btn!.height).toBeLessThan(740);
  });

  test("on a wide screen the benefits sit beside the form instead of below it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    const aside = await page.getByRole("complementary", { name: "Why sign in" }).boundingBox();
    const main = await page.getByRole("main").boundingBox();
    expect(aside!.x).toBeLessThan(main!.x);
    expect(Math.abs(aside!.y - main!.y)).toBeLessThan(40);
  });
});
