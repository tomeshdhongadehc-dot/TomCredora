import { expect, test, type Page } from "@playwright/test";

const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker required.";
const ORIGINAL = "Built dashboards in React used by 5,000 users";
const EMBELLISHED = "Engineered high-traffic React dashboards serving 5,000 active users by optimizing component architecture";

async function toReview(page: Page) {
  await page.goto("/build");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByLabel("Full name").fill("Asha Rao");
  await page.getByLabel("Email").fill("asha@example.com");
  await page.getByRole("button", { name: "+ Add role" }).click();
  await page.getByLabel("Job title").fill("Engineer");
  await page.getByLabel("Company").fill("Acme");
  await page.getByLabel("Start").first().fill("Jan 2021");
  await page.getByLabel("End").first().fill("Present");
  await page.getByLabel(/What you did/).fill(ORIGINAL);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Paste the job description").fill(JD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your resume vs. this job" })).toBeVisible({ timeout: 20_000 });
}

/** Mocked API answer: one bullet the verifier flagged as embellished. */
async function mockTailor(page: Page, seen?: { headers: Record<string, string> }) {
  await page.route("**/api/v1/tailor", async (route) => {
    if (seen) seen.headers = route.request().headers();
    const body = JSON.parse(route.request().postData() ?? "{}");
    body.profile.experience[0].bullets = [EMBELLISHED];
    await route.fulfill({
      json: {
        resume: body.profile,
        issues: [],
        questions: [],
        ledger: [{
          roleId: body.profile.experience[0].id, position: 0, text: EMBELLISHED, from: 0, original: ORIGINAL, needsMetric: false,
          status: "needs-confirmation", reasons: ['New wording not in your original: "engineered", "high-traffic", "optimizing". Confirm it is true.'],
        }],
      },
    });
  });
}

const paper = (page: Page) => page.locator("[data-resume-paper]");
const show = async (page: Page, isMobile: boolean) => { if (isMobile) await page.getByRole("tab", { name: "Preview" }).click(); };
const edit = async (page: Page, isMobile: boolean) => { if (isMobile) await page.getByRole("tab", { name: "Edit" }).click(); };

test.describe("truthfulness: confirming AI-added wording", () => {
  test("flagged bullets are listed with the AI's wording, the user's original and the reason", async ({ page }) => {
    await toReview(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Tailor with AI" }).click();
    const panel = page.getByRole("region", { name: "Bullets to confirm" });
    await expect(panel).toContainText("Please confirm these 1 bullet");
    await expect(panel).toContainText(`AI wrote: ${EMBELLISHED}`);
    await expect(panel).toContainText(`You wrote: ${ORIGINAL}`);
    await expect(panel).toContainText("high-traffic");
  });

  test("'Use my original' restores the user's wording in the resume and clears the item", async ({ page, isMobile }) => {
    await toReview(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Tailor with AI" }).click();
    await show(page, isMobile);
    await expect(paper(page)).toContainText(EMBELLISHED);
    await edit(page, isMobile);
    await page.getByRole("button", { name: "Use my original" }).click();
    await expect(page.getByRole("region", { name: "Bullets to confirm" })).toHaveCount(0);
    await show(page, isMobile);
    await expect(paper(page)).toContainText(ORIGINAL);
    await expect(paper(page)).not.toContainText("high-traffic");
  });

  test("'It is true, keep it' keeps the AI wording and dismisses the item", async ({ page, isMobile }) => {
    await toReview(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Tailor with AI" }).click();
    await page.getByRole("button", { name: "It is true, keep it" }).click();
    await expect(page.getByRole("region", { name: "Bullets to confirm" })).toHaveCount(0);
    await show(page, isMobile);
    await expect(paper(page)).toContainText(EMBELLISHED);
  });

  test("a bullet the user edits afterwards is theirs: no warning, and it is never overwritten", async ({ page, isMobile }) => {
    await toReview(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Tailor with AI" }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click(); // job
    await page.getByRole("button", { name: "Back", exact: true }).click(); // profile
    await page.getByLabel(/What you did/).fill("My own later edit");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await edit(page, isMobile);
    await expect(page.getByRole("region", { name: "Bullets to confirm" })).toHaveCount(0);
    await show(page, isMobile);
    await expect(paper(page)).toContainText("My own later edit");
  });

  test("REGRESSION: warnings survive leaving the Review step and coming back", async ({ page, isMobile }) => {
    await toReview(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Tailor with AI" }).click();
    await expect(page.getByRole("region", { name: "Bullets to confirm" })).toBeVisible();
    await page.getByRole("button", { name: "Step 1: Profile" }).click();
    await page.getByRole("button", { name: "Step 3: Review" }).click();
    await edit(page, isMobile);
    await expect(page.getByRole("region", { name: "Bullets to confirm" })).toContainText(`AI wrote: ${EMBELLISHED}`);
  });

  test("REGRESSION: warnings survive a page reload, and a confirmed bullet stays confirmed", async ({ page, isMobile }) => {
    await toReview(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Tailor with AI" }).click();
    await expect(page.getByRole("region", { name: "Bullets to confirm" })).toBeVisible();
    await page.waitForTimeout(700); // autosave debounce
    await page.reload();
    // a reload now stays on the Review step (each step has its own address), so there is nothing to click through
    await edit(page, isMobile);
    await expect(page.getByRole("region", { name: "Bullets to confirm" })).toBeVisible();
    await page.getByRole("button", { name: "It is true, keep it" }).click();
    await page.waitForTimeout(700);
    await page.reload();
    // a reload now stays on the Review step (each step has its own address), so there is nothing to click through
    await edit(page, isMobile);
    await expect(page.getByRole("heading", { name: "Your resume vs. this job" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Bullets to confirm" })).toHaveCount(0);
  });
});

test.describe("bring your own Gemini key", () => {
  test("is sent as a header, kept in this tab only, masked, and never in localStorage", async ({ page }) => {
    await toReview(page);
    const seen = { headers: {} as Record<string, string> };
    await mockTailor(page, seen);
    await page.getByText("Use your own Gemini key (free)").click();
    const input = page.getByLabel(/Get a free key at/);
    await expect(input).toHaveAttribute("type", "password");
    await input.fill("AIzaFAKE-KEY-for-test-0123456789");
    await page.getByRole("button", { name: "Tailor with AI" }).click();
    await expect(page.getByRole("region", { name: "Bullets to confirm" })).toBeVisible();
    expect(seen.headers["x-gemini-key"]).toBe("AIzaFAKE-KEY-for-test-0123456789");
    const where = await page.evaluate(() => ({
      session: sessionStorage.getItem("arb.gemini"),
      local: JSON.stringify({ ...localStorage }).includes("AIzaFAKE"),
    }));
    expect(where.session).toBe("AIzaFAKE-KEY-for-test-0123456789");
    expect(where.local, "key must not be persisted in localStorage (or in the autosaved draft)").toBe(false);
  });

  test("no key means no header", async ({ page }) => {
    await toReview(page);
    const seen = { headers: {} as Record<string, string> };
    await mockTailor(page, seen);
    await page.getByRole("button", { name: "Tailor with AI" }).click();
    await expect(page.getByRole("region", { name: "Bullets to confirm" })).toBeVisible();
    expect(seen.headers["x-gemini-key"]).toBeUndefined();
  });

  test("a quota error is explained in plain language", async ({ page }) => {
    await toReview(page);
    await page.route("**/api/v1/tailor", (route) =>
      route.fulfill({ status: 503, json: { error: { code: "ai_quota_exhausted", message: "Today's free AI quota is used up. Try again tomorrow, or add your own free Gemini key to keep going.", requestId: "x" } } }),
    );
    await page.getByRole("button", { name: "Tailor with AI" }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("add your own free Gemini key");
  });
});
