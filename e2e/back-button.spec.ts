import { expect, test, type Page } from "@playwright/test";

/**
 * Pressing Back (or reloading, or leaving and coming back) must never cost anyone their typing, like a Google Form.
 * Every scenario goes from the landing page into the tool, types, presses the browser's Back button AT ONCE (inside the
 * short autosave delay), then Forward, and checks that nothing is gone.
 */
const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker required.";

async function openTool(page: Page, link: RegExp) {
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByRole("link", { name: link }).first().click();
  await page.waitForLoadState("domcontentloaded");
}
const backAndForward = async (page: Page) => {
  await page.goBack(); // pressed by mistake, straight after typing
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await page.goForward();
};

test.describe("typed data survives Back and Forward", () => {
  test("guided builder: contact and role fields", async ({ page }) => {
    await openTool(page, /Build my resume/);
    await page.getByLabel("Full name").fill("Meera Iyer");
    await page.getByRole("button", { name: "+ Add role" }).click();
    await page.getByLabel("Job title").fill("Engineer");
    await page.getByLabel("Company").fill("Acme");
    await backAndForward(page);
    await expect(page.getByLabel("Full name")).toHaveValue("Meera Iyer");
    await expect(page.getByLabel("Job title")).toHaveValue("Engineer");
    await expect(page.getByLabel("Company")).toHaveValue("Acme");
  });

  test("workspace: fields", async ({ page }) => {
    await openTool(page, /Workspace/);
    await page.getByLabel("Full name").fill("Meera Iyer");
    await page.getByLabel("Location").fill("Pune");
    await backAndForward(page);
    await expect(page.getByLabel("Full name")).toHaveValue("Meera Iyer");
    await expect(page.getByLabel("Location")).toHaveValue("Pune");
  });

  test("quick resume: the pasted job description", async ({ page }) => {
    await openTool(page, /Quick resume/);
    await page.getByLabel("Paste the job description").fill(JD);
    await backAndForward(page);
    await expect(page.getByLabel("Paste the job description")).toHaveValue(JD);
  });

  test("profile: fields, unfinished email, taps, and the text typed into add-your-own boxes", async ({ page }) => {
    await openTool(page, /Profile/);
    await page.getByLabel("Full name").fill("Meera Iyer");
    await page.getByLabel("Email").fill("meera@"); // not a valid email yet
    await page.getByRole("radio", { name: "Software & IT" }).click();
    await page.getByRole("button", { name: "TypeScript", exact: true }).click();
    await page.getByRole("textbox", { name: "another languages skill" }).fill("Rust"); // typed, not added
    await page.getByRole("button", { name: "+ Add a project" }).click();
    await page.getByLabel("Project name").fill("Resume app");
    await page.getByLabel("Built with (comma separated)").fill("React, Node"); // never blurred
    await backAndForward(page);
    await expect(page.getByLabel("Full name")).toHaveValue("Meera Iyer");
    await expect(page.getByLabel("Email")).toHaveValue("meera@");
    await expect(page.getByRole("radio", { name: "Software & IT" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("group", { name: "Languages skills" }).getByRole("button", { name: "TypeScript", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "another languages skill" })).toHaveValue("Rust");
    await expect(page.getByLabel("Project name")).toHaveValue("Resume app");
    await expect(page.getByLabel("Built with (comma separated)")).toHaveValue("React, Node");
  });

  test("a half-typed box is cleared once the item is added, and does not come back", async ({ page }) => {
    await page.goto("/profile");
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.getByRole("radio", { name: "Software & IT" }).click();
    const box = page.getByRole("textbox", { name: "another languages skill" });
    await box.fill("Rust");
    await box.press("Enter");
    await expect(box).toHaveValue("");
    await page.reload();
    await expect(page.getByRole("textbox", { name: "another languages skill" })).toHaveValue("");
    await expect(page.getByRole("group", { name: "Languages skills" }).getByRole("button", { name: "Rust", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("the sign-in email box keeps what was typed", async ({ page }) => {
    await page.goto("/profile");
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Email address").fill("meera@exam");
    await page.reload();
    await expect(page.getByLabel("Email address")).toHaveValue("meera@exam");
    await page.goBack(); // to the profile, then forward again
    await page.goForward();
    await expect(page.getByLabel("Email address")).toHaveValue("meera@exam");
  });
});

test.describe("the guided builder's steps are pages of a form", () => {
  async function toJobStep(page: Page) {
    await openTool(page, /Build my resume/);
    await page.getByRole("button", { name: "Load example" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Paste the job description")).toBeVisible();
  }

  test("each step has its own address", async ({ page }) => {
    await toJobStep(page);
    await expect(page).toHaveURL(/step=job/);
    await page.getByLabel("Paste the job description").fill(JD);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/step=review/);
  });

  test("Back goes to the previous step, not out of the builder, and Forward returns with the text kept", async ({ page }) => {
    await toJobStep(page);
    await page.getByLabel("Paste the job description").fill(JD);
    await page.goBack();
    await expect(page.getByLabel("Full name")).toBeVisible(); // the profile step, with its data
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");
    await expect(page).not.toHaveURL(/step=/);
    await page.goForward();
    await expect(page.getByLabel("Paste the job description")).toHaveValue(JD);
    await expect(page).toHaveURL(/step=job/);
  });

  test("Back from the first step leaves the builder, and coming back lands where the data allows", async ({ page }) => {
    await toJobStep(page);
    await page.getByLabel("Paste the job description").fill(JD);
    await page.goBack(); // profile step
    await page.goBack(); // out of the builder, to the landing page
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await page.goForward();
    await page.goForward();
    await expect(page.getByLabel("Paste the job description")).toHaveValue(JD);
  });

  test("reloading on a step stays on that step, with the data", async ({ page }) => {
    await toJobStep(page);
    await page.getByLabel("Paste the job description").fill(JD);
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.getByLabel("Paste the job description")).toHaveValue(JD);
    await expect(page).toHaveURL(/step=job/);
  });

  test("a link to a later step with nothing filled in opens the first step instead of an empty page", async ({ page }) => {
    await page.goto("/build");
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto("/build?step=design");
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page).not.toHaveURL(/step=design/);
  });

  test("the in-app Back button returns to the previous step with everything kept", async ({ page }) => {
    await toJobStep(page);
    await page.getByLabel("Paste the job description").fill(JD);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Paste the job description")).toHaveValue(JD);
  });

  test("a template chosen from the landing page survives the steps", async ({ page }) => {
    await page.goto("/build?template=slate");
    await page.evaluate(() => { sessionStorage.clear(); });
    await page.getByRole("button", { name: "Load example" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/template=slate/);
    await expect(page).toHaveURL(/step=job/);
  });
});
