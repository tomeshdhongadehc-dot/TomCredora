import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PDFParse } from "pdf-parse";
import { PNG } from "pngjs";
import { PRESETS } from "../src/lib/templates";

const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker required.";

async function toDesign(page: Page, name?: string) {
  await page.goto("/build");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Load example" }).click();
  if (name) await page.getByLabel("Full name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Paste the job description").fill(JD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Choose a template" })).toBeVisible();
}

async function download(page: Page, name: string) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
  return { file: dl.suggestedFilename(), text: readFileSync(await dl.path(), "utf8") };
}

/** Rasterise page 1 of a PDF so two renderings can be compared pixel by pixel. */
async function firstPagePng(pdf: Buffer) {
  const p = new PDFParse({ data: pdf });
  const shot = await p.getScreenshot({ scale: 1.5, first: 1, last: 1 });
  const text = (await p.getText()).text.replace(/\s+/g, " ").trim();
  const total = (await p.getText()).total;
  await p.destroy();
  return { png: PNG.sync.read(Buffer.from(shot.pages[0].data)), text, total };
}

test.describe("HTML/CSS export matches each template exactly", () => {
  for (const preset of PRESETS) {
    test(`${preset.name}: exported page prints identically to the app's own print output`, async ({ page, context }) => {
      await toDesign(page);
      await page.getByRole("radio", { name: new RegExp(`^${preset.name}`) }).click();

      // A: what the app itself prints
      await page.emulateMedia({ media: "print" });
      const appPdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      await page.emulateMedia({ media: null });

      // B: the downloaded HTML file, opened on its own with no app, no JS and no network
      const { file, text: html } = await download(page, "Download HTML (web page)");
      expect(file).toBe("Asha_Rao_Senior_Frontend_Engineer.html");
      const exported = await context.newPage();
      const requests: string[] = [];
      exported.on("request", (r) => { if (!r.url().startsWith("data:") && !r.url().startsWith("about:")) requests.push(r.url()); });
      await exported.setContent(html, { waitUntil: "load" });
      await exported.emulateMedia({ media: "print" });
      const htmlPdf = await exported.pdf({ preferCSSPageSize: true, printBackground: true });
      expect(requests, "export makes no network requests").toEqual([]);
      await exported.close();

      const a = await firstPagePng(appPdf);
      const b = await firstPagePng(htmlPdf);
      expect(b.total, "same page count").toBe(a.total);
      expect(b.text, "same text, same order").toBe(a.text);
      expect([b.png.width, b.png.height], "same page size").toEqual([a.png.width, a.png.height]);
      const diff = pixelmatch(a.png.data, b.png.data, undefined, a.png.width, a.png.height, { threshold: 0.1 });
      const ratio = diff / (a.png.width * a.png.height);
      test.info().annotations.push({ type: "pixel difference", description: `${(ratio * 100).toFixed(4)}%` });
      expect(ratio, `pixel difference ${(ratio * 100).toFixed(3)}%`).toBeLessThan(0.002);
    });
  }

  test("negative control: the comparison really detects a different template", async ({ page, context }) => {
    await toDesign(page);
    await page.emulateMedia({ media: "print" });
    const classicPdf = await page.pdf({ preferCSSPageSize: true });
    await page.emulateMedia({ media: null });
    await page.getByRole("radio", { name: /^Modern/ }).click();
    const { text: modernHtml } = await download(page, "Download HTML (web page)");
    const exported = await context.newPage();
    await exported.setContent(modernHtml);
    await exported.emulateMedia({ media: "print" });
    const modernPdf = await exported.pdf({ preferCSSPageSize: true });
    await exported.close();
    const a = await firstPagePng(classicPdf);
    const b = await firstPagePng(modernPdf);
    const diff = pixelmatch(a.png.data, b.png.data, undefined, a.png.width, a.png.height, { threshold: 0.1 });
    expect(diff / (a.png.width * a.png.height), "different templates must NOT look identical").toBeGreaterThan(0.01);
  });

  test("the downloaded CSS file is exactly the stylesheet inside the HTML", async ({ page }) => {
    await toDesign(page);
    await page.getByRole("radio", { name: /^Executive/ }).click();
    const html = (await download(page, "Download HTML (web page)")).text;
    const css = await download(page, "Download CSS (styles)");
    expect(css.file).toMatch(/\.css$/);
    expect(html).toContain(css.text.trimEnd());
    expect(css.text).toContain("/* TomCredora resume styles. Template: executive */");
  });

  test("hostile content cannot inject script into the exported page", async ({ page, context }) => {
    await toDesign(page, '</title><script>window.__pwned=1</script><img src=x onerror="window.__pwned=2">');
    const { text: html } = await download(page, "Download HTML (web page)");
    expect(html).not.toMatch(/<script|<img /i);
    const exported = await context.newPage();
    await exported.setContent(html);
    expect(await exported.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await exported.close();
  });

  test("the exported page is accessible and screen-readable on its own (axe)", async ({ page, context }) => {
    await toDesign(page);
    const { text: html } = await download(page, "Download HTML (web page)");
    const exported = await context.newPage();
    await exported.setContent(html);
    const r = await new AxeBuilder({ page: exported }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    expect(await exported.title()).toBe("Asha Rao - Resume");
    await exported.close();
  });

  test("on screen the exported page is a centred sheet that fits a phone width", async ({ page, context }) => {
    await toDesign(page);
    const { text: html } = await download(page, "Download HTML (web page)");
    const exported = await context.newPage();
    await exported.setViewportSize({ width: 390, height: 800 });
    await exported.setContent(html);
    const overflow = await exported.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no horizontal scroll at 390px").toBeLessThanOrEqual(0);
    await exported.close();
  });
});
