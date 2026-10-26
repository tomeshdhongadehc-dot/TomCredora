import { expect, test, type Page } from "@playwright/test";
import { PDFParse } from "pdf-parse";

const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker required.";

async function toDesign(page: Page) {
  await page.goto("/build?template=curve");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/build?template=curve");
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Paste the job description").fill(JD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Arrange your resume" })).toBeVisible({ timeout: 20_000 });
}

const paper = (page: Page) => page.locator("[data-resume-paper]");

test.describe("Curve template", () => {
  test("opens pre-selected from the landing link and draws the CurVe-style layout", async ({ page }) => {
    await toDesign(page);
    await expect(page.getByRole("radio", { name: /^Curve/ })).toHaveAttribute("aria-checked", "true");
    const p = paper(page);
    // centred, capitalised, light, accent-coloured name
    const h1 = p.locator("h1");
    await expect(h1).toHaveText("ASHA RAO");
    const style = await h1.evaluate((el) => ({ w: getComputedStyle(el).fontWeight, c: getComputedStyle(el).color, a: getComputedStyle(el.parentElement!).textAlign }));
    expect(style).toEqual({ w: "400", c: "rgb(31, 58, 95)", a: "center" });
    // dot-separated contact line
    await expect(p.locator("header")).toContainText("asha.rao@example.com · +91 90000 00000");
    // the intro has no heading, the rest do
    expect(await p.locator("h2").allTextContents()).toEqual(["Skills", "Experience", "Education", "Certifications"]);
    await expect(p).toContainText("Frontend engineer with 6 years building React");
    // "Role — Company, place" on one line with the dates on the right
    await expect(p).toContainText("Senior Frontend Engineer — Acme Corp, Bengaluru");
    await expect(p).toContainText("Languages — TypeScript");
  });

  test("a heading can be switched back on, and lead terms back to bold", async ({ page, isMobile }) => {
    await toDesign(page);
    await page.getByLabel("Show heading line for Summary").check();
    expect((await paper(page).locator("h2").allTextContents())[0]).toBe("Summary");
    await page.getByRole("radiogroup", { name: "Lead terms" }).getByRole("radio", { name: "Bold" }).click();
    if (isMobile) await page.getByRole("tab", { name: "Preview" }).click();
    await expect(paper(page).locator("strong").first()).toBeVisible();
  });

  test("the printed PDF keeps the reading order an ATS needs: intro, then each section's heading before its content", async ({ page }) => {
    await toDesign(page);
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const parser = new PDFParse({ data: pdf });
    const { text, total } = await parser.getText();
    await parser.destroy();
    expect(total).toBe(1);
    const flat = text.replace(/\s+/g, " ");
    const at = (s: string) => flat.indexOf(s);
    const order = ["ASHA RAO", "Frontend engineer with 6 years", "Skills", "Languages", "Experience", "Acme Corp", "Education", "B.E. Computer Science", "Certifications"].map(at);
    expect(order.every((i) => i >= 0), JSON.stringify(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(flat).toContain("Senior Frontend Engineer — Acme Corp, Bengaluru");
  });

  test("a long Curve resume flows onto a second page without losing anything", async ({ page }) => {
    await toDesign(page);
    await page.getByRole("button", { name: "Step 1: Profile" }).click();
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: "+ Add role" }).click();
      await page.getByLabel("Job title").last().fill(`Role ${i}`);
      await page.getByLabel("Company").last().fill(`Company ${i}`);
      await page.getByLabel(/What you did/).last().fill(Array.from({ length: 5 }, (_, k) => `Delivered result number ${k} for the team with measurable impact on 20 users`).join("\n"));
    }
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue" }).click();
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const parser = new PDFParse({ data: pdf });
    const { text, total } = await parser.getText();
    await parser.destroy();
    expect(total).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 5; i++) expect(text).toContain(`Company ${i}`);
  });
});
