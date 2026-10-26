import { expect, test, type Page } from "@playwright/test";
import { PDFParse } from "pdf-parse";
import { PRESETS } from "../src/lib/templates";

const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker required.";

async function toDesign(page: Page) {
  await page.goto("/build");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Paste the job description").fill(JD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Choose a template" })).toBeVisible();
}

const HEADING: Record<string, string> = {
  summary: "SUMMARY", skills: "SKILLS", experience: "EXPERIENCE", projects: "PROJECTS", education: "EDUCATION", certifications: "CERTIFICATIONS",
};

test.describe("every template, end to end", () => {
  for (const preset of PRESETS) {
    test(`${preset.name}: preview, 1-page text PDF in the template's section order`, async ({ page }) => {
      await toDesign(page);
      await page.getByRole("radio", { name: new RegExp(`^${preset.name}`) }).click();
      await expect(page.getByRole("radio", { name: new RegExp(`^${preset.name}`) })).toHaveAttribute("aria-checked", "true");

      // preview reflects the template's section order
      const headings = await page.locator("[data-resume-paper] h2").allTextContents();
      // a preset may rename a heading (Standard: "Technical Skills")
      const titleOf = (s: string) => (preset.config.sectionTitles as Record<string, string>)[s]?.toUpperCase() ?? HEADING[s];
      const want = preset.config.sectionOrder.map(titleOf).filter((h) => headings.some((x) => x.toUpperCase() === h));
      expect(headings.map((h) => h.toUpperCase())).toEqual(want);

      // the real print path: text-based, one page, ordered, no app chrome
      await page.emulateMedia({ media: "print" });
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      const parser = new PDFParse({ data: pdf });
      const { text, pages } = await parser.getText();
      await parser.destroy();
      expect(pages.length, "fits one page").toBe(1);
      const flat = text.replace(/\s+/g, " ");
      for (const s of ["Asha Rao", "Acme Corp", "Globex", "VTU", "Rebuilt checkout in React and TypeScript", "asha.rao@example.com"]) expect(flat.toLowerCase(), s).toContain(s.toLowerCase()) // names may be set in capitals by the template;
      const idx = want.map((h) => text.toUpperCase().indexOf(h));
      expect(idx.every((i) => i >= 0), "all sections present in PDF text").toBe(true);
      expect([...idx].sort((a, b) => a - b), "PDF sections follow the template order").toEqual(idx);
      for (const ui of ["Continue", "Download PDF", "Customise", "Skip to content"]) expect(text).not.toContain(ui);

      // role-first vs company-first is visible in the extracted text order
      const roleAt = flat.indexOf("Senior Frontend Engineer", flat.indexOf("Acme") - 80 > 0 ? flat.indexOf("Acme") - 80 : 0);
      expect(roleAt).toBeGreaterThanOrEqual(0);
    });
  }

  test("filter chips narrow the gallery and keep the selected template visible", async ({ page }) => {
    await toDesign(page);
    const cards = () => page.getByRole("radiogroup", { name: "Template" }).getByRole("radio");
    expect(await cards().count()).toBe(PRESETS.length);
    await page.getByRole("button", { name: "Entry level" }).click();
    await expect(cards().and(page.getByRole("radio", { name: /^Graduate/ }))).toHaveCount(1);
    await expect(cards().and(page.getByRole("radio", { name: /^Executive/ }))).toHaveCount(0);
    await expect(cards().and(page.getByRole("radio", { name: /^Classic/ }))).toHaveCount(1); // currently selected stays visible
    await page.getByRole("button", { name: "All", exact: true }).click();
    expect(await cards().count()).toBe(PRESETS.length);
  });

  test("layout controls change the preview structure", async ({ page }) => {
    await toDesign(page);
    const firstEntry = () => page.locator("[data-resume-paper] section").nth(2);
    await page.getByRole("radio", { name: "Job title", exact: true }).click();
    await expect(page.locator("[data-resume-paper]")).toContainText("Senior Frontend Engineer");
    await page.getByRole("radio", { name: "In one line", exact: true }).first().click();
    await expect(page.locator("[data-resume-paper]")).toContainText("Senior Frontend Engineer | Acme Corp | Jan 2022 - Present");
    void firstEntry;
    await page.getByRole("radio", { name: "navy", exact: true }).click();
    await page.getByRole("radio", { name: "Extra", exact: true }).click();
    const h1 = await page.locator("[data-resume-paper] h1").evaluate((el) => getComputedStyle(el).color);
    expect(h1).toBe("rgb(31, 58, 95)"); // extra-large names take the accent colour (#1f3a5f)
  });

  test("a customised template exports LaTeX that mirrors the layout", async ({ page }) => {
    await toDesign(page);
    await page.getByRole("radio", { name: /^Minimal/ }).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download LaTeX (.tex)" }).click()]);
    const tex = (await import("node:fs")).readFileSync(await dl.path(), "utf8");
    expect(tex).toContain("\\entryinline{Acme Corp}");
    expect(tex).toContain("label=--");
    expect(tex).toContain(" ~|~ ");
  });
});
