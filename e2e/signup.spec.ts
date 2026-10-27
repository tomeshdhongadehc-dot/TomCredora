import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Creating an account. Same no-password email link as signing in; the page just says so plainly (test-only fake sign-in in these tests). */
const email = (page: Page) => page.getByLabel("Email address");
const create = (page: Page) => page.getByRole("button", { name: "Create account", exact: true });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const alertBox = (page: Page) => page.getByRole("main").getByRole("alert");

async function fresh(page: Page, path = "/signup?next=%2Fprofile") {
  await page.goto(path);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test.describe("the create-account page", () => {
  test("says what you get and what it costs, in plain words", async ({ page }) => {
    await fresh(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your free account");
    await expect(page.getByRole("main")).toContainText("Free, no password, no card");
    await expect(page.getByRole("list", { name: "How signing in works" }).getByRole("listitem")).toHaveText([/Enter your email/, /Open the email/, /your account is ready/]);
    await expect(page.getByRole("main")).toContainText("By creating an account you agree to the");
    await expect(page).toHaveTitle(/Create account/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("a bad address is refused next to the field; a good one creates the account and returns you to where you were going", async ({ page }) => {
    await fresh(page, "/signup?next=%2Fstudio");
    await email(page).fill("nope");
    await create(page).click();
    await expect(alertBox(page)).toContainText("does not look like an email");
    await expect(email(page)).toBeFocused();
    await email(page).fill("new.person@example.com");
    await create(page).click();
    await expect(page).toHaveURL(/\/studio$/, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Account:/ })).toBeVisible();
  });

  test("waiting for the link says the account is not made until the link is clicked", async ({ page }) => {
    await fresh(page);
    await email(page).fill("new+link@example.com");
    await create(page).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
    await expect(page.getByRole("main")).toContainText("finish creating your account");
  });

  test("the two pages point at each other and keep where you were going", async ({ page }) => {
    await fresh(page, "/signup?next=%2Fquick");
    await page.getByRole("main").getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/signin\?next=%2Fquick/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to save your work");
    await page.getByRole("link", { name: "Create a free account" }).click();
    await expect(page).toHaveURL(/\/signup\?next=%2Fquick/);
  });

  test("a hostile ?next can never send you to another site, and /signup cannot loop to itself", async ({ page }) => {
    await fresh(page, "/signup?next=https%3A%2F%2Fevil.example%2Fx");
    await email(page).fill("a@example.com");
    await create(page).click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 });
    await fresh(page, "/signup?next=%2Fsignup");
    await email(page).fill("b@example.com");
    await create(page).click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 });
  });

  test("nothing scrolls sideways, even at 320px; fields are 16px and buttons are tall enough to tap", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await fresh(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await email(page).evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
    expect((await create(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await email(page).fill("new+link@example.com");
    await create(page).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("finding the page", () => {
  test("the header offers 'Sign up' next to 'Sign in' on wider screens, and it opens the create-account page", async ({ page, isMobile }) => {
    await fresh(page, "/ats-resume-templates");
    if (isMobile) {
      await expect(page.getByRole("link", { name: "Sign up", exact: true })).toBeHidden(); // phones keep the header short: Sign in leads to the link
    } else {
      await page.getByRole("link", { name: "Sign up", exact: true }).click();
      await expect(page).toHaveURL(/\/signup\?next=%2Fats-resume-templates/);
    }
  });

  test("the sign-in page links to it and the sitemap leaves it out", async ({ page, request }) => {
    await fresh(page, "/signin");
    await expect(page.getByRole("link", { name: "Create a free account" })).toHaveAttribute("href", /\/signup\?next=/);
    const map = await (await request.get("/sitemap.xml")).text();
    expect(map).not.toContain("/signup");
    expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /signup");
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`the create-account page passes the accessibility scan, in ${scheme} mode, form and waiting states`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    const scan = () => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();
    expect((await scan()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    await email(page).fill("new+link@example.com");
    await create(page).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your email");
    expect((await scan()).violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  });
}
