import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";

const JD =
  "We are hiring a Senior Frontend Engineer to build React and TypeScript applications with Next.js, GraphQL APIs and CI/CD on AWS. Docker experience required.";

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

const paper = (page: Page) => page.locator("[data-resume-paper]");
const sectionOrder = async (page: Page) =>
  paper(page).evaluate((el) => [...el.querySelectorAll("h2")].map((h) => h.textContent?.toLowerCase() ?? ""));

async function download(page: Page, name: string) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), buf: readFileSync(path) };
}

test.describe("templates and customiser", () => {
  test("switching templates changes the live preview", async ({ page }) => {
    await toDesign(page);
    const font = () => paper(page).evaluate((el) => getComputedStyle(el).fontFamily);
    expect(await font()).toMatch(/Calibri/);
    await page.getByRole("radio", { name: /Academic/ }).click();
    expect(await font()).toMatch(/Times/);
    // Academic puts education before experience
    const order = await sectionOrder(page);
    expect(order.indexOf("education")).toBeLessThan(order.indexOf("experience"));
    await page.getByRole("radio", { name: /Modern/ }).click();
    expect(await font()).toMatch(/Arial/);
  });

  test("thumbnails use real content but are hidden from assistive tech", async ({ page, isMobile }) => {
    await toDesign(page);
    if (isMobile) await page.getByRole("tab", { name: "Preview" }).click();
    await expect(page.getByRole("article")).toHaveCount(1); // only the real preview is exposed
    if (isMobile) await page.getByRole("tab", { name: "Edit" }).click();
    await expect(page.getByRole("radio", { name: /Classic/ })).toContainText("Selected");
  });

  test("sliders update the preview and the guard explains risky values", async ({ page }) => {
    await toDesign(page);
    const size = () => paper(page).evaluate((el) => el.style.fontSize);
    const before = await size();
    await page.getByLabel(/Text size/).fill("12");
    expect(await size()).not.toBe(before);
    await expect(page.getByRole("radio", { name: /Classic/ })).toContainText("Customised");
    await page.getByLabel(/Text size/).fill("9");
    await expect(page.getByRole("list", { name: "Design warnings" })).toContainText("under 9.5pt");
    await page.getByRole("button", { name: /Reset to Classic/ }).click();
    await expect(page.getByRole("list", { name: "Design warnings" })).toHaveCount(0);
  });

  test("section order can be changed and is reflected in the preview", async ({ page }) => {
    await toDesign(page);
    await page.getByRole("button", { name: "Move Education up" }).click();
    await page.getByRole("button", { name: "Move Education up" }).click();
    await page.getByRole("button", { name: "Move Education up" }).click();
    const order = await sectionOrder(page);
    expect(order.indexOf("education")).toBeLessThan(order.indexOf("experience"));
    await expect(page.getByRole("button", { name: "Move Summary up" })).toBeDisabled();
  });

  test("custom settings persist across a reload", async ({ page }) => {
    await toDesign(page);
    await page.getByRole("radio", { name: "Navy" }).click().catch(() => undefined);
    await page.getByRole("radio", { name: /Compact/ }).click();
    await page.waitForTimeout(600);
    await page.reload(); // stays on the design step: each step has its own address
    await expect(page.getByRole("radio", { name: /Compact/ })).toContainText("Selected");
  });
});

test.describe("exports", () => {
  test("LaTeX download is escaped, complete and named safely", async ({ page }) => {
    await toDesign(page);
    const { name, buf } = await download(page, "Download LaTeX (.tex)");
    const tex = buf.toString("utf8");
    expect(name).toBe("Asha_Rao_Senior_Frontend_Engineer.tex");
    expect(tex).toContain("\\documentclass");
    expect(tex).toContain("Asha Rao");
    expect(tex).toContain("\\end{document}");
    expect(tex).toContain("14\\% across 2M"); // % escaped
  });

  test("DOCX download opens as a zip and contains the resume text", async ({ page }) => {
    await toDesign(page);
    const { name, buf } = await download(page, "Download DOCX");
    expect(name).toMatch(/\.docx$/);
    const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
    expect(xml).toContain("Asha Rao");
    expect(xml).toContain("Acme Corp");
    expect(xml).not.toContain("<w:tbl>");
  });

  test("TXT and JSON backups are valid", async ({ page }) => {
    await toDesign(page);
    const txt = (await download(page, "Plain text (.txt)")).buf.toString("utf8");
    expect(txt.startsWith("ASHA RAO")).toBe(true);
    expect(txt).toMatch(/EXPERIENCE[\s\S]*Acme Corp \| Senior Frontend Engineer \| Jan 2022 - Present/);
    const json = JSON.parse((await download(page, "Backup (.json)")).buf.toString("utf8"));
    expect(json.resume.contact.fullName).toBe("Asha Rao");
    expect(json.template.id).toBe("classic");
  });

  test("Overleaf receives the LaTeX source via POST in a new tab", async ({ page, context }) => {
    await toDesign(page);
    let posted: { method: string; body: string } | null = null;
    await context.route("https://www.overleaf.com/**", async (route) => {
      posted = { method: route.request().method(), body: route.request().postData() ?? "" };
      await route.fulfill({ status: 200, contentType: "text/html", body: "ok" });
    });
    const popup = context.waitForEvent("page");
    await page.getByRole("button", { name: "Open in Overleaf" }).click();
    await popup;
    await expect.poll(() => posted?.method).toBe("POST");
    const params = new URLSearchParams(posted!.body);
    expect(decodeURIComponent(params.get("encoded_snip")!)).toContain("\\documentclass");
  });

  test("PDF (print output) has selectable text, correct order and no app UI", async ({ page }) => {
    await toDesign(page);
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const parser = new PDFParse({ data: pdf });
    const { text, pages } = await parser.getText();
    expect(pages.length).toBe(1);
    expect(text).toContain("Asha Rao");
    expect(text.replace(/\s+/g, " ")).toContain("Rebuilt checkout in React and TypeScript");
    const i = (s: string) => text.toUpperCase().indexOf(s);
    expect(i("SUMMARY")).toBeLessThan(i("SKILLS"));
    expect(i("SKILLS")).toBeLessThan(i("EXPERIENCE"));
    expect(i("EXPERIENCE")).toBeLessThan(i("EDUCATION"));
    for (const ui of ["Continue", "Download PDF", "Customise", "Skip to content"]) expect(text).not.toContain(ui);
    await parser.destroy();
  });

  test("A4 setting produces an A4 PDF page", async ({ page }) => {
    await toDesign(page);
    await page.getByRole("radio", { name: "A4" }).click();
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString("latin1"));
    expect(box, "PDF has a readable MediaBox").not.toBeNull();
    expect(Math.round(Number(box![1]))).toBe(595);
    expect(Math.round(Number(box![2]))).toBe(842);
  });

  test("long resumes flow to a second page with margins intact", async ({ page }) => {
    await toDesign(page);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "+ Add role" }).click();
      await page.getByLabel("Job title").last().fill(`Role ${i}`);
      await page.getByLabel("Company").last().fill(`Company ${i}`);
      await page.getByLabel(/What you did/).last().fill(Array.from({ length: 5 }, (_, k) => `Delivered result number ${k} for the team with measurable impact on 20 users`).join("\n"));
    }
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue" }).click();
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const parser = new PDFParse({ data: pdf });
    const { pages } = await parser.getText();
    expect(pages.length).toBeGreaterThanOrEqual(2);
    await parser.destroy();
  });

  test("exports are disabled until a name exists", async ({ page }) => {
    await page.goto("/build");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByLabel("Full name").fill("A");
    await page.getByLabel("Email").fill("a@b.co");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Paste the job description").fill(JD);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  });

  test("ATS view shows linear plain text", async ({ page }) => {
    await toDesign(page);
    await page.getByRole("button", { name: /how an ATS reads this/ }).click();
    await expect(page.getByLabel("Plain text as an ATS sees it")).toContainText("ASHA RAO");
  });
});

test.describe("accessibility (axe)", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`no serious violations on every step (${scheme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      // Entrance animations fade elements in; scanning mid-fade reads a half-transparent colour. Wait for the finite ones.
      const settle = () =>
        page.evaluate(() =>
          Promise.all(document.getAnimations().filter((x) => x.effect?.getComputedTiming().iterations !== Infinity).map((x) => x.finished.catch(() => undefined))),
        );
      const scan = async (label: string) => {
        await settle();
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();
        const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 90)}`), label).toEqual([]);
      };
      await scan("landing");
      await toDesign(page); // visits steps 1-3 on the way
      await scan("design");
      for (const [i, label] of ["profile", "job", "review"].entries()) {
        await page.getByRole("button", { name: new RegExp(`Step ${i + 1}`) }).click();
        await page.waitForTimeout(300);
        await scan(label);
      }
    });
  }
});
