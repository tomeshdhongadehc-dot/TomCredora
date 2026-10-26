import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Sign-in and sync, with the test-only sign-in (AUTH_MODE=mock). Each "device" is its own browser context with its own
 * storage; devices that sign in with the same email share one account on the server.
 */
const unique = () => `u${Math.random().toString(36).slice(2, 8)}@example.com`;
const slug = (email: string) => email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const token = (email: string) => `mock.${slug(email)}.x`;

async function device(browser: Browser, baseURL: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ baseURL });
  return { ctx, page: await ctx.newPage() };
}
const baseOf = () => test.info().project.use.baseURL as string;

const dialog = (page: Page) => page.getByRole("dialog");

/** Through the real sign-in page: the header link, the form, and the return to the page you were on. */
async function signIn(page: Page, email: string) {
  const from = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/signin\?next=/);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${from.replace(/\//g, "\/")}$`), { timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Account:/ })).toBeVisible();
}
async function openAccount(page: Page) {
  await page.getByRole("button", { name: /Account:/ }).click();
  await expect(dialog(page)).toBeVisible();
}
async function syncNow(page: Page) {
  await openAccount(page);
  await dialog(page).getByRole("button", { name: "Sync now" }).click();
  await expect(dialog(page).getByRole("status")).toContainText(/Synced/, { timeout: 15_000 });
  await dialog(page).getByRole("button", { name: "Close" }).click();
}
const cloud = async (page: Page, email: string) => {
  const r = await page.request.get("/api/v1/sync", { headers: { authorization: `Bearer ${token(email)}` } });
  return r.status() === 200 ? (await r.json()).snapshot : null;
};
const settle = (page: Page) => page.waitForTimeout(800); // autosave is debounced

async function fresh(page: Page, path = "/profile") {
  await page.goto(path);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
}

test.describe("signing in", () => {
  test("signed out: the header has a Sign in link to the sign-in page, and a bad email is refused", async ({ page }) => {
    await fresh(page);
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/signin\?next=%2Fprofile/);
    await expect(page.getByRole("main")).toContainText("everything stays in this browser only");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("does not look like an email");
    await expect(page).toHaveURL(/\/signin/); // still here
  });

  test("the sync API refuses anyone who is not signed in", async ({ request }) => {
    expect((await request.get("/api/v1/sync")).status()).toBe(401);
    expect((await request.get("/api/v1/sync", { headers: { authorization: "Bearer garbage" } })).status()).toBe(401);
    expect((await request.put("/api/v1/sync", { data: {}, headers: { "if-none-match": "*" } })).status()).toBe(401);
  });

  test("signing in uploads what is on this device, and the dialog says so", async ({ page }) => {
    const email = unique();
    await fresh(page);
    await page.getByRole("button", { name: "Load example" }).click();
    await settle(page);
    await signIn(page, email);
    await syncNow(page);
    const snap = await cloud(page, email);
    expect(snap.profile.data.resume.contact.fullName).toBe("Asha Rao");
  });
});

test.describe("your data follows you", () => {
  test("a second device gets the profile and resumes after signing in", async ({ page, browser }) => {
    const email = unique();
    await fresh(page);
    await page.getByRole("button", { name: "Load example" }).click();
    await settle(page);
    await signIn(page, email);
    await syncNow(page);

    const b = await device(browser, baseOf());
    await b.page.goto("/profile");
    await expect(b.page.getByLabel("Full name")).toHaveValue(""); // a brand-new device has nothing
    await signIn(b.page, email);
    await expect(b.page.getByLabel("Full name")).toHaveValue("Asha Rao", { timeout: 15_000 }); // restored, no reload needed
    await b.ctx.close();
  });

  test("clearing the browser's data is no longer a disaster: sign in again and it comes back", async ({ page }) => {
    const email = unique();
    await fresh(page);
    await page.getByRole("button", { name: "Load example" }).click();
    await settle(page);
    await signIn(page, email);
    await syncNow(page);

    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); // what "clear site data" does
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("");
    await signIn(page, email);
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao", { timeout: 15_000 });
  });

  test("an edit on one device reaches the other", async ({ page, browser }) => {
    const email = unique();
    await fresh(page);
    await page.getByRole("button", { name: "Load example" }).click();
    await settle(page);
    await signIn(page, email);
    await syncNow(page);
    const b = await device(browser, baseOf());
    await b.page.goto("/profile");
    await signIn(b.page, email);
    await expect(b.page.getByLabel("Full name")).toHaveValue("Asha Rao", { timeout: 15_000 });

    await b.page.getByLabel("Full name").fill("Asha R. Rao");
    await settle(b.page);
    await syncNow(b.page);
    await syncNow(page);
    await expect(page.getByLabel("Full name")).toHaveValue("Asha R. Rao", { timeout: 15_000 });
    await b.ctx.close();
  });

  test("a resume deleted on one device stays deleted on the other", async ({ page, browser }) => {
    const email = unique();
    await fresh(page, "/studio");
    await page.getByRole("button", { name: "Load example" }).click();
    await settle(page);
    await page.getByRole("button", { name: /My resumes/ }).click();
    await page.getByLabel("New resume name").fill("Second resume");
    await page.getByRole("button", { name: "New from example" }).click();
    await settle(page);
    await signIn(page, email);
    await syncNow(page);

    const b = await device(browser, baseOf());
    await b.page.goto("/studio");
    await signIn(b.page, email);
    await expect.poll(async () => (await cloud(b.page, email)).resumes.length, { timeout: 15_000 }).toBe(2);
    await b.page.getByRole("button", { name: /My resumes/ }).click();
    const dlgB = b.page.getByRole("dialog", { name: "My resumes" });
    await expect(dlgB.getByRole("textbox", { name: "Rename Second resume" })).toBeVisible({ timeout: 15_000 });
    // delete "Second resume" on device B
    await dlgB.getByRole("button", { name: "Delete Second resume" }).click();
    await dlgB.getByRole("button", { name: /^Yes, delete/ }).click();
    await settle(b.page);
    await b.page.keyboard.press("Escape");
    await syncNow(b.page);
    await expect.poll(async () => (await cloud(b.page, email)).resumes.length, { timeout: 15_000 }).toBe(1);

    await syncNow(page);
    await page.getByRole("button", { name: /My resumes/ }).click();
    await expect(page.getByRole("dialog", { name: "My resumes" }).getByRole("textbox", { name: "Rename Second resume" })).toHaveCount(0);
    await b.ctx.close();
  });
});

test.describe("accounts are separate", () => {
  test("one person's data never shows up for another", async ({ page, browser }) => {
    const a = unique();
    const other = unique();
    await fresh(page);
    await page.getByRole("button", { name: "Load example" }).click();
    await settle(page);
    await signIn(page, a);
    await syncNow(page);
    expect(await cloud(page, other)).toBeNull();

    const b = await device(browser, baseOf());
    await b.page.goto("/profile");
    await signIn(b.page, other);
    await b.page.waitForTimeout(1500);
    await expect(b.page.getByLabel("Full name")).toHaveValue("");
    await b.ctx.close();
  });
});

test.describe("signing out and deleting", () => {
  test("Sign out keeps this device's data and stops syncing", async ({ page }) => {
    const email = unique();
    await fresh(page);
    await page.getByRole("button", { name: "Load example" }).click();
    await settle(page);
    await signIn(page, email);
    await syncNow(page);
    await openAccount(page);
    await dialog(page).getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");
  });

  test("Sign out and clear this device wipes the local copy but not the account", async ({ page }) => {
    const email = unique();
    await fresh(page);
    await page.getByRole("button", { name: "Load example" }).click();
    await settle(page);
    await signIn(page, email);
    await syncNow(page);
    await openAccount(page);
    await dialog(page).getByRole("button", { name: "Sign out and clear this device" }).click();
    await page.waitForLoadState("load");
    await expect(page.getByLabel("Full name")).toHaveValue("");
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("arb.")))).toEqual([]);
    expect((await cloud(page, email)).profile.data.resume.contact.fullName).toBe("Asha Rao");
  });

  test("Delete my saved data needs a confirmation, removes the cloud copy, signs out, and keeps the device copy", async ({ page }) => {
    const email = unique();
    await fresh(page);
    await page.getByRole("button", { name: "Load example" }).click();
    await settle(page);
    await signIn(page, email);
    await syncNow(page);
    await openAccount(page);
    await dialog(page).getByRole("button", { name: /Delete my saved data/ }).click();
    await expect(dialog(page).getByRole("alertdialog")).toContainText("removes your saved copy");
    await dialog(page).getByRole("button", { name: "Keep it" }).click();
    expect(await cloud(page, email)).not.toBeNull(); // cancelled: nothing deleted
    await dialog(page).getByRole("button", { name: /Delete my saved data/ }).click();
    await dialog(page).getByRole("button", { name: "Yes, delete it" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    expect(await cloud(page, email)).toBeNull();
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");
    await page.waitForTimeout(1500);
    expect(await cloud(page, email)).toBeNull(); // and it is not quietly uploaded again
  });
});

test.describe("when the network is down", () => {
  test("edits are kept on the device, the dialog says so, and they sync when the connection returns", async ({ page, context }) => {
    const email = unique();
    await fresh(page);
    await page.getByRole("button", { name: "Load example" }).click();
    await settle(page);
    await signIn(page, email);
    await syncNow(page);

    await context.setOffline(true);
    await page.getByLabel("Full name").fill("Asha Offline");
    await settle(page);
    await openAccount(page);
    await dialog(page).getByRole("button", { name: "Sync now" }).click();
    await expect(dialog(page).getByRole("status")).toContainText(/offline/i, { timeout: 15_000 });
    await dialog(page).getByRole("button", { name: "Close" }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Offline");

    await context.setOffline(false);
    await syncNow(page);
    expect((await cloud(page, email)).profile.data.resume.contact.fullName).toBe("Asha Offline");
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`the sign-in page and the account dialog pass the axe scan (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    const scan = async (label: string) => {
      await page.evaluate(() => Promise.all(document.getAnimations().filter((x) => x.effect?.getComputedTiming().iterations !== Infinity).map((x) => x.finished.catch(() => undefined))));
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();
      expect(r.violations.map((v) => `${label}: ${v.id} ${v.nodes[0]?.target}`), label).toEqual([]);
    };
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in to save your work" })).toBeVisible();
    await scan("sign-in page");
    await page.getByLabel("Email address").fill(unique());
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 20_000 });
    await openAccount(page);
    await expect(dialog(page).getByRole("status")).toContainText(/Synced|Syncing|Ready/);
    await scan("signed-in dialog");
  });
}
