import { expect, test, type Page } from "@playwright/test";

const JD =
  "We are hiring a Senior Frontend Engineer to build React and TypeScript applications with Next.js, GraphQL APIs and CI/CD on AWS. Docker experience required.";

const alert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

async function fillProfile(page: Page) {
  await page.getByLabel("Full name").fill("Asha Rao");
  await page.getByLabel("Email").fill("asha@example.com");
  await page.getByRole("button", { name: "+ Add role" }).click();
  await page.getByLabel("Job title").fill("Frontend Engineer");
  await page.getByLabel("Company").fill("Acme");
  await page.getByLabel("Start").first().fill("Jan 2021");
  await page.getByLabel("End").first().fill("Present");
  await page.getByLabel(/What you did/).fill("Built React dashboard used by 12,000 customers\nMigrated 40 components to TypeScript");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/build");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("landing page renders and links to the builder", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("right resume");
  await page.getByRole("link", { name: "Build my resume" }).first().click(); // hero CTA (the page repeats it at the end)
  await expect(page).toHaveURL(/\/build/);
});

test("requires name and email before continuing", async ({ page }) => {
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Add your full name")).toBeVisible();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
});

test("profile -> job -> review with live preview, keywords and score", async ({ page, isMobile }) => {
  await fillProfile(page);
  if (isMobile) await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByRole("article", { name: "Resume preview" })).toContainText("Asha Rao");
  await expect(page.getByRole("article", { name: "Resume preview" })).toContainText("12,000 customers");
  if (isMobile) await page.getByRole("tab", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Paste the job description").fill("short");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(alert(page)).toContainText("at least 40");

  await page.getByLabel("Paste the job description").fill(JD);
  await expect(page.getByText("Keywords we found")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // The Review step is code-split; allow for a cold dev-server compile under parallel load.
  await expect(page.getByRole("heading", { name: "Your resume vs. this job" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("img", { name: /ATS score: \d+ out of 100/ })).toBeVisible();
  await expect(page.getByLabel("Matched keywords")).toContainText("react");
  await expect(page.getByLabel("Missing keywords")).toContainText("graphql");
});

test("shows a friendly message when AI is not configured", async ({ page }) => {
  await fillProfile(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Paste the job description").fill(JD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Tailor with AI" }).click();
  await expect(alert(page)).toContainText("AI is not configured");
});

test("applies an AI result (mocked) and keeps the draft after reload", async ({ page, isMobile }) => {
  await fillProfile(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Paste the job description").fill(JD);
  await page.getByRole("button", { name: "Continue" }).click();

  let key = "";
  await page.route("**/api/v1/tailor", async (route) => {
    key = route.request().headers()["idempotency-key"] ?? "";
    const body = JSON.parse(route.request().postData() ?? "{}");
    body.profile.summary = "Frontend engineer building React and TypeScript products.";
    await route.fulfill({
      json: { resume: body.profile, issues: [], questions: ["How much did load time improve?"], ledger: [] },
    });
  });
  await page.getByRole("button", { name: "Tailor with AI" }).click();
  await expect(page.getByText("How much did load time improve?")).toBeVisible();
  expect(key).toMatch(/^[0-9a-f-]{36}$/);

  await page.waitForTimeout(600); // autosave debounce
  await page.reload();
  if (isMobile) await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByRole("article", { name: "Resume preview" })).toContainText("Asha Rao");
});

test("has no obvious accessibility regressions: labelled inputs and a skip link", async ({ page }) => {
  await expect(page.getByRole("link", { name: "Skip to content" })).toHaveCount(1);
  const unlabeled = await page.$$eval("input, textarea", (els) =>
    els.filter((e) => !(e as HTMLInputElement).labels?.length && !e.getAttribute("aria-label")).length,
  );
  expect(unlabeled).toBe(0);
});
