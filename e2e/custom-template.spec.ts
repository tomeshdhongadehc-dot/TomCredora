import { expect, test, type Page } from "@playwright/test";
import { PDFParse } from "pdf-parse";

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
  await expect(page.getByRole("heading", { name: "Arrange your resume" })).toBeVisible({ timeout: 20_000 });
}

const paper = (page: Page) => page.locator("[data-resume-paper]");
const headings = (page: Page) => paper(page).locator("h2").allTextContents();
const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());

async function printedText(page: Page) {
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ preferCSSPageSize: true });
  await page.emulateMedia({ media: null });
  const p = new PDFParse({ data: pdf });
  const { text, total } = await p.getText();
  await p.destroy();
  return { text, pages: total };
}

test.describe("arranging content and position", () => {
  test("hide, rename and reorder sections: the preview and the printed PDF both follow", async ({ page }) => {
    await toDesign(page);
    expect(lower(await headings(page))).toEqual(["summary", "skills", "experience", "education", "certifications"]);

    await page.getByLabel("Show Certifications").uncheck();
    await page.getByLabel("Heading for Experience").fill("Work History");
    await page.getByRole("button", { name: "Move Experience up" }).click();
    await page.getByRole("button", { name: "Move Experience up" }).click();
    expect(lower(await headings(page))).toEqual(["work history", "summary", "skills", "education"]);

    const { text, pages } = await printedText(page);
    const up = text.toUpperCase();
    expect(pages).toBe(1);
    expect(up).not.toContain("CERTIFICATIONS");
    expect(up).not.toContain("AWS CERTIFIED");
    const order = ["WORK HISTORY", "SUMMARY", "SKILLS", "EDUCATION"].map((s) => up.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b), "PDF sections follow the arrangement").toEqual(order);
  });

  test("drag and drop with a real mouse reorders sections", async ({ page, isMobile }) => {
    test.skip(isMobile, "pointer dragging is exercised on desktop; mobile uses the arrow buttons");
    await toDesign(page);
    // the list is far down the page: bring it on screen first, or the mouse would be dragging in empty space
    await page.getByRole("list", { name: "Section order" }).scrollIntoViewIfNeeded();
    const from = await page.getByRole("button", { name: "Drag Education to reorder" }).boundingBox();
    const to = await page.getByRole("button", { name: "Drag Summary to reorder" }).boundingBox();
    expect(from && to).toBeTruthy();
    const x = from!.x + from!.width / 2;
    await page.mouse.move(x, from!.y + from!.height / 2);
    await page.mouse.down();
    // move like a hand does: small steps with a beat between them, so the list can re-measure as rows pass
    const startY = from!.y + from!.height / 2;
    const endY = to!.y - 6;
    for (let i = 1; i <= 24; i++) {
      await page.mouse.move(x, startY + ((endY - startY) * i) / 24);
      await page.waitForTimeout(25);
    }
    await page.mouse.up();
    await expect.poll(async () => lower(await headings(page))).toEqual(["education", "summary", "skills", "experience", "certifications"]);
  });

  test("contact details: choose which appear, their order, separator and stacking", async ({ page }) => {
    await toDesign(page);
    await page.getByRole("button", { name: "Move Phone up" }).click();
    await page.getByLabel("Show Links").uncheck();
    await page.getByRole("radio", { name: "Slash", exact: true }).click();
    await expect(paper(page)).toContainText("+91 90000 00000 / asha.rao@example.com / Bengaluru, India");
    await expect(paper(page)).not.toContainText("linkedin.com");

    await page.getByRole("radiogroup", { name: "Contact layout" }).getByRole("radio", { name: "Stacked" }).click();
    const lines = await paper(page).locator("header p").allTextContents();
    expect(lines.slice(-3)).toEqual(["+91 90000 00000", "asha.rao@example.com", "Bengaluru, India"]);
  });

  test("header position and section spacing change the layout", async ({ page }) => {
    await toDesign(page);
    const align = () => paper(page).locator("header").evaluate((el) => getComputedStyle(el).textAlign);
    await page.getByRole("radio", { name: "Right", exact: true }).click();
    expect(await align()).toBe("right");
    await page.getByRole("radio", { name: "Left", exact: true }).click();
    expect(await align()).toBe("left");

    const gap = () => paper(page).locator("h2").nth(1).evaluate((el) => parseFloat(getComputedStyle(el).marginTop) / parseFloat(getComputedStyle(el).fontSize));
    await page.getByRole("radio", { name: "Tight", exact: true }).click();
    const tight = await gap();
    await page.getByRole("radio", { name: "Airy", exact: true }).click();
    expect(await gap()).toBeGreaterThan(tight * 1.5);
  });

  test("guard rails explain risky choices instead of blocking them", async ({ page }) => {
    await toDesign(page);
    const warnings = page.getByRole("list", { name: "Design warnings" });
    await page.getByLabel("Show Email").uncheck();
    await expect(warnings).toContainText("email is hidden");
    await page.getByLabel("Show Email").check();
    await page.getByLabel("Heading for Experience").fill("My Journey");
    await expect(warnings).toContainText("may not be recognised by ATS parsers");
    await page.getByLabel("Heading for Experience").fill("Work History");
    await expect(page.getByRole("list", { name: "Design warnings" })).toHaveCount(0);
  });

  test("heading box refuses characters the schema forbids (no markup, no digits)", async ({ page }) => {
    await toDesign(page);
    const box = page.getByLabel("Heading for Skills");
    await box.fill("<b>Tech</b> 99 & Tools");
    const value = await box.inputValue();
    expect(value).not.toMatch(/[<>0-9=()]/);
    expect(value).toContain("Tools");
    expect(await paper(page).locator("b, img, script").count()).toBe(0);
  });

  test("sections with no content are labelled, so moving past them is not a mystery", async ({ page }) => {
    await toDesign(page);
    const row = (name: string) => page.getByRole("list", { name: "Section order" }).locator("li", { has: page.getByLabel(`Show ${name}`) });
    await expect(row("Projects")).toContainText("no content yet");
    await expect(row("Experience")).not.toContainText("no content yet");
  });
});

test.describe("My templates", () => {
  async function arrange(page: Page) {
    await page.getByLabel("Heading for Experience").fill("Work History");
    await page.getByLabel("Show Certifications").uncheck();
    await page.getByRole("button", { name: "Move Education up" }).click(); // past the empty Projects row...
    await page.getByRole("button", { name: "Move Education up" }).click(); // ...and above Experience
    await page.getByRole("radio", { name: "Right", exact: true }).click();
  }

  test("save, reuse, persist across reload, rename and delete", async ({ page }) => {
    await toDesign(page);
    await arrange(page);
    await expect(page.getByRole("button", { name: "Save as new template" })).toBeDisabled();
    await page.getByLabel("Name for the current design").fill("Consulting one-pager");
    await page.getByRole("button", { name: "Save as new template" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toContainText('Saved "Consulting one-pager"');

    const mine = page.getByRole("radiogroup", { name: "My templates" });
    await expect(mine.getByRole("radio", { name: "Consulting one-pager" })).toHaveAttribute("aria-checked", "true");

    // switch to a built-in template: the arrangement is gone from the preview...
    await page.getByRole("radio", { name: /^Modern/ }).click();
    expect(lower(await headings(page))).toContain("certifications");
    // ...and one click on the saved template brings it back
    await mine.getByRole("radio", { name: "Consulting one-pager" }).click();
    expect(lower(await headings(page))).toEqual(["summary", "skills", "education", "work history"]);

    // survives a reload
    await page.waitForTimeout(700);
    await page.reload(); // stays on the design step: each step has its own address
    await expect(page.getByRole("radiogroup", { name: "My templates" }).getByRole("radio", { name: "Consulting one-pager" })).toBeVisible({ timeout: 20_000 });

    // rename
    const rename = page.getByLabel("Rename Consulting one-pager");
    await rename.fill("Board pack");
    await rename.press("Enter");
    await expect(page.getByRole("radiogroup", { name: "My templates" }).getByRole("radio", { name: "Board pack" })).toBeVisible();

    // delete
    await page.getByRole("button", { name: "Delete Board pack" }).click();
    await expect(page.getByRole("radiogroup", { name: "My templates" })).toHaveCount(0);
  });

  test("editing a saved template and pressing Update keeps it in sync", async ({ page }) => {
    await toDesign(page);
    await page.getByLabel("Name for the current design").fill("Mine");
    await page.getByRole("button", { name: "Save as new template" }).click();
    await page.getByLabel("Heading for Skills").fill("Core Competencies");
    await expect(page.getByRole("button", { name: /Update .Mine./ })).toBeVisible();
    await page.getByRole("button", { name: /Update .Mine./ }).click();
    await page.getByRole("radio", { name: /^Modern/ }).click();
    await page.getByRole("radiogroup", { name: "My templates" }).getByRole("radio", { name: "Mine" }).click();
    expect(lower(await headings(page))).toContain("core competencies");
  });

  test("the printed PDF of a saved template matches its arrangement", async ({ page }) => {
    await toDesign(page);
    await arrange(page);
    await page.getByLabel("Name for the current design").fill("PDF check");
    await page.getByRole("button", { name: "Save as new template" }).click();
    const { text } = await printedText(page);
    const up = text.toUpperCase();
    expect(up).toContain("WORK HISTORY");
    expect(up).not.toContain("CERTIFICATIONS");
    expect(up.indexOf("EDUCATION")).toBeLessThan(up.indexOf("WORK HISTORY"));
  });

  test("tampered saved templates in storage are ignored, and the app still works", async ({ page }) => {
    await page.goto("/build");
    await page.evaluate(() =>
      localStorage.setItem("arb.templates.v1", JSON.stringify([
        { id: "custom-bad00001", name: "<script>alert(1)</script>", config: { nope: true } },
        { id: "../../etc", name: "evil", config: {} },
        { id: "custom-good0001", name: "Good one", config: { id: "x", font: "calibri", sizePt: 11, lineHeight: 1.3, marginIn: 0.65, paper: "letter", accent: "black", headerAlign: "left", headingStyle: "rule", headingCase: "upper", bullet: "disc", sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications"], sectionTitles: { skills: "<b>x</b>" } } },
      ])),
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.reload();
    await page.getByRole("button", { name: "Load example" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Paste the job description").fill(JD);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Choose a template" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("radiogroup", { name: "My templates" })).toHaveCount(0); // every entry was rejected
    expect(errors).toEqual([]);
  });

  test("the layout editor passes the accessibility scan", async ({ page }) => {
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    await toDesign(page);
    await page.getByLabel("Name for the current design").fill("A11y");
    await page.getByRole("button", { name: "Save as new template" }).click();
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
  });
});
