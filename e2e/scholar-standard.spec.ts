import { expect, test, type Page } from "@playwright/test";

const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker required.";

async function toDesign(page: Page, id: string) {
  await page.goto(`/build?template=${id}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/build?template=${id}`);
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Paste the job description").fill(JD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Arrange your resume" })).toBeVisible({ timeout: 20_000 });
}

const paper = (page: Page) => page.locator("[data-resume-paper]");

test.describe("Scholar template", () => {
  test("draws a three-column header, small-caps headings, bold dates and aligned skills", async ({ page, isMobile }) => {
    await toDesign(page, "scholar");
    if (isMobile) await page.getByRole("tab", { name: "Preview" }).click();
    const p = paper(page);
    await expect(p.locator("header.rp-head3")).toBeVisible();
    const h2 = p.locator("h2").first();
    expect(await h2.evaluate((el) => getComputedStyle(el).fontVariantCaps)).toBe("small-caps");
    expect(await p.locator(".rp-skillrow").count()).toBeGreaterThan(0);
    // the name sits between the left and right contact blocks
    const box = async (sel: string) => (await p.locator(sel).first().boundingBox())!;
    const name = await box("h1");
    const left = await box(".rp-head3 > div:nth-child(2)");
    const right = await box(".rp-head3 > div:nth-child(3)");
    expect(left.x).toBeLessThan(name.x);
    expect(right.x).toBeGreaterThan(name.x);
    await p.screenshot({ path: test.info().outputPath("scholar.png") });
  });

  test("the header options can be switched back to the plain stacked layout", async ({ page, isMobile }) => {
    await toDesign(page, "scholar");
    await page.getByRole("radiogroup", { name: "Header layout" }).getByRole("radio", { name: "Stacked" }).click();
    await page.getByRole("radiogroup", { name: "Skills style" }).getByRole("radio", { name: "Per line" }).click();
    if (isMobile) await page.getByRole("tab", { name: "Preview" }).click();
    await expect(paper(page).locator("header.rp-head3")).toHaveCount(0);
    await expect(paper(page).locator(".rp-skillrow")).toHaveCount(0);
  });
});

test.describe("Standard template", () => {
  test("centred header, one-line projects, title-case headings and a renamed skills heading", async ({ page, isMobile }) => {
    await toDesign(page, "standard");
    if (isMobile) await page.getByRole("tab", { name: "Preview" }).click();
    const p = paper(page);
    const titles = await p.locator("h2").allTextContents();
    expect(titles).toContain("Technical Skills");
    expect(titles).toContain("Experience");
    await expect(p.locator("header.rp-head3")).toHaveCount(0);
    await p.screenshot({ path: test.info().outputPath("standard.png") });
  });
});
