import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker required. Mentor juniors.";

async function ready(page: Page) {
  await page.goto("/quick");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.route("**/api/v1/tailor", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({ json: { resume: { ...body.profile, summary: "Frontend engineer with 6 years building React and TypeScript products used by millions." }, issues: [], questions: [], ledger: [] } });
  });
  await page.getByRole("button", { name: "Load example profile" }).click();
  await page.getByLabel("Paste the job description").fill(JD);
  await page.getByLabel(/These details are accurate/).check();
  await page.getByRole("button", { name: /Create (my resume|again)|Creating/ }).click();
  await expect(page.getByLabel("Your resume", { exact: true })).toBeVisible({ timeout: 20_000 });
}
const paper = (page: Page) => page.locator("[data-resume-paper]").first();
const card = (page: Page) => page.locator("section, div").filter({ has: page.getByRole("heading", { name: "Edit and improve your content" }) }).last();

test.describe("edit and improve your content", () => {
  test("the summary: tell the AI what you want, see it, and only then use it", async ({ page }) => {
    await ready(page);
    let sent: Record<string, unknown> = {};
    await page.route("**/api/v1/rewrite", async (route) => {
      sent = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({ json: { text: "Senior frontend engineer who ships fast, reliable React products and mentors teams", novel: ["senior"] } });
    });
    const before = await paper(page).innerText();
    const summary = page.getByRole("group", { name: /^Change this summary/ });
    await summary.getByRole("button", { name: /^Ask the AI to rewrite/ }).click();
    const ask = page.getByRole("group", { name: "Tell the AI what you want for this summary" });
    await expect(ask.getByRole("button", { name: "Rewrite it" })).toBeDisabled(); // nothing asked yet
    await ask.getByRole("button", { name: "Make it sound more senior" }).click(); // an idea fills the box
    await expect(ask.getByLabel(/Say what you want/)).toHaveValue("Make it sound more senior");
    await ask.getByLabel(/Say what you want/).fill("make it sound more senior and mention mentoring");
    await ask.getByRole("button", { name: "Rewrite it" }).click();
    const sug = page.getByRole("group", { name: "Suggested wording" });
    await expect(sug).toContainText("Senior frontend engineer who ships");
    await expect(sug.getByRole("note")).toContainText('"senior"'); // new wording is called out
    expect(sent).toMatchObject({ kind: "summary", instruction: "make it sound more senior and mention mentoring" });
    expect(String(sent.jd)).toContain("React"); // the job is sent so its keywords can be used
    expect(JSON.stringify(sent)).not.toContain("asha.rao@example.com"); // contact details never go
    expect(await paper(page).innerText()).toBe(before); // nothing changed yet
    await sug.getByRole("button", { name: "Use this" }).click();
    await expect(paper(page)).toContainText("Senior frontend engineer who ships fast");
  });

  test("a point: your own request, then Change my request, then keep mine", async ({ page }) => {
    await ready(page);
    const sent: Record<string, unknown>[] = [];
    await page.route("**/api/v1/rewrite", async (route) => {
      sent.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({ json: { text: `Rebuilt checkout in React and TypeScript, version ${sent.length}`, novel: [] } });
    });
    const before = await paper(page).innerText();
    const group = page.getByRole("group", { name: /^Change this point/ }).first();
    await group.getByRole("button", { name: /^Ask the AI to rewrite/ }).click();
    await page.getByLabel(/Say what you want/).fill("use more technical words");
    await page.getByRole("button", { name: "Rewrite it" }).click();
    await expect(page.getByRole("group", { name: "Suggested wording" })).toContainText("version 1");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("group", { name: "Suggested wording" })).toContainText("version 2");
    await page.getByRole("button", { name: "Change my request" }).click();
    await expect(page.getByLabel(/Say what you want/)).toHaveValue("use more technical words");
    await page.getByRole("button", { name: "Cancel" }).first().click();
    expect(sent[0].kind).toBe("bullet");
    expect(await paper(page).innerText()).toBe(before);
  });

  test("a failed request explains itself and leaves the summary alone", async ({ page }) => {
    await ready(page);
    await page.route("**/api/v1/rewrite", (route) => route.fulfill({ status: 503, json: { error: { code: "ai_quota_exhausted", message: "Today's free AI quota is used up. Try again tomorrow, or add your own free Gemini key to keep going." } } }));
    const before = await paper(page).innerText();
    await page.getByRole("group", { name: /^Change this summary/ }).getByRole("button", { name: /^Ask the AI to rewrite/ }).click();
    await page.getByLabel(/Say what you want/).fill("shorter please");
    await page.getByRole("button", { name: "Rewrite it" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "quota is used up" })).toBeVisible();
    expect(await paper(page).innerText()).toBe(before);
  });

  test("an empty summary can be written by hand", async ({ page }) => {
    await page.goto("/quick");
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.route("**/api/v1/tailor", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({ json: { resume: body.profile, issues: [], questions: [], ledger: [] } });
    });
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Paste the job description").fill(JD);
    await page.getByLabel(/These details are accurate/).check();
    await page.getByRole("button", { name: /Create (my resume|again)|Creating/ }).click();
    await expect(page.getByLabel("Your resume", { exact: true })).toBeVisible({ timeout: 20_000 });
    const g = page.getByRole("group", { name: /^Change this summary/ });
    await expect(g.getByRole("button", { name: /^Ask the AI/ })).toHaveCount(0); // nothing to reword yet
    await g.getByRole("button", { name: /^Edit by hand/ }).click();
    await page.getByLabel("Edit this summary").fill("Frontend engineer who writes accessible React.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(paper(page)).toContainText("Frontend engineer who writes accessible React.");
  });

  test("the summary and a project can be edited by hand, with a character count", async ({ page }) => {
    await ready(page);
    await page.getByRole("group", { name: /^Change this summary/ }).getByRole("button", { name: /^Edit by hand/ }).click();
    const box = page.getByLabel("Edit this summary");
    await box.fill("A short summary I wrote myself.");
    await expect(page.getByText("31 of 600 characters")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(paper(page)).toContainText("A short summary I wrote myself.");
    // a project line, if the example has projects
    const project = page.getByText(/^Project: /).first();
    if (await project.count()) {
      await project.click();
      await page.getByRole("group", { name: /^Change this point/ }).last().getByRole("button", { name: /^Edit by hand/ }).click();
      await page.getByLabel("Edit this point").fill("Built a tool I wrote about by hand");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(paper(page)).toContainText("Built a tool I wrote about by hand");
    }
  });

  test("sections can be rearranged from the result, and the resume follows", async ({ page }) => {
    await ready(page);
    await page.getByText("Arrange sections and change the look").click();
    const order = async () => (await paper(page).locator("h2").allInnerTexts()).map((t) => t.toLowerCase());
    const before = await order();
    expect(before.length).toBeGreaterThan(2);
    const first = before[0];
    await page.getByRole("button", { name: /^Move .* down$/ }).first().click();
    const after = await order();
    expect(after[0]).not.toBe(first);
    expect(after).toContain(first);
  });

  for (const width of [320, 390]) {
    test(`no sideways scrolling at ${width}px with the editor and arranging open`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await ready(page);
      await page.getByRole("group", { name: /^Change this summary/ }).getByRole("button", { name: /^Ask the AI to rewrite/ }).click();
      await page.getByText("Arrange sections and change the look").click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }

  test("passes the accessibility scan with the editor open", async ({ page }) => {
    await ready(page);
    await page.getByRole("group", { name: /^Change this summary/ }).getByRole("button", { name: /^Ask the AI to rewrite/ }).click();
    const r = await new AxeBuilder({ page }).include("main").analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
  });
});
void card;
