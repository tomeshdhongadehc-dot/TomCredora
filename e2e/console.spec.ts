import { expect, test, type Page } from "@playwright/test";
import { PRESETS } from "../src/lib/templates";

/**
 * The app must never log a console error or React warning, whatever the user clicks. (Mixing the CSS `padding`
 * shorthand with `paddingBottom` across re-renders once did, and nothing caught it because the pages still worked.)
 * This runs against `next dev`, which is where React reports these.
 */
const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker required.";

function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
  return problems;
}

/** Click every option of every segmented control in the design panel, one after another. */
async function cycleControls(page: Page) {
  const groups = page.getByRole("radiogroup");
  const n = await groups.count();
  for (let g = 0; g < n; g++) {
    const group = groups.nth(g);
    const label = (await group.getAttribute("aria-label")) ?? "";
    if (label === "Template" || label === "Accent colour") continue; // cycled separately
    const radios = group.getByRole("radio");
    const count = await radios.count();
    // Every option -> every other option. React only warns on a direct switch (e.g. Ruled -> Shaded), so
    // visiting the options in one fixed order is not enough.
    for (let from = 0; from < count; from++) {
      for (let to = 0; to < count; to++) {
        if (from === to) continue;
        await radios.nth(from).click({ timeout: 5000 }).catch(() => {});
        await radios.nth(to).click({ timeout: 5000 }).catch(() => {});
      }
    }
  }
}

test.describe("no console errors or React warnings", () => {
  test.setTimeout(180_000); // every option-to-option switch of every control is exercised
  test("guided builder: every template, then every design control, then each accent", async ({ page }) => {
    const problems = watch(page);
    await page.goto("/build");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Load example" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Paste the job description").fill(JD);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Choose a template" })).toBeVisible();

    for (const p of PRESETS) {
      await page.getByRole("radio", { name: new RegExp(`^${p.name}`) }).click();
      await expect(page.locator("[data-resume-paper]")).toBeAttached();
    }
    await cycleControls(page);
    for (const a of ["black", "navy", "forest", "maroon", "slate"]) await page.getByRole("radio", { name: a, exact: true }).click();
    expect(problems).toEqual([]);
  });

  test("studio: every template and design control", async ({ page, isMobile }) => {
    const problems = watch(page);
    await page.goto("/studio");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Load example" }).click();
    if (isMobile) await page.getByRole("tablist", { name: "Workspace view" }).getByRole("tab", { name: "Design" }).click();
    for (const p of PRESETS) await page.getByRole("radio", { name: new RegExp(`^${p.name}`) }).click();
    await cycleControls(page);
    expect(problems).toEqual([]);
  });
});

test("landing page and resumes dialog log nothing", async ({ page }) => {
  const problems = watch(page);
  await page.goto("/");
  await page.waitForTimeout(800);
  await page.goto("/studio");
  await page.getByRole("button", { name: "Load example" }).click();
  expect(problems).toEqual([]);
});

test("profile and quick pages log nothing while a profile is built and used", async ({ page }) => {
  const problems = watch(page);
  await page.goto("/profile");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Load example" }).click();
  for (const f of ["Software & IT", "Data & AI", "Design & Creative", "Finance & Accounting", "Software & IT"]) await page.getByRole("radio", { name: f }).click();
  await page.getByRole("button", { name: "+ Add a role" }).click();
  await page.getByLabel("Start month").last().selectOption("Mar");
  await page.getByLabel("Start year").last().selectOption("2021");
  await page.getByLabel("I work here now").last().check();
  await page.getByLabel("I work here now").last().uncheck();
  await page.getByRole("button", { name: "+ Add education" }).click();
  await page.getByLabel("Degree", { exact: true }).last().selectOption("__other");
  await page.getByLabel("Degree", { exact: true }).last().selectOption("MBA");
  await page.getByRole("button", { name: "+ Add a project" }).click();
  await page.goto("/quick");
  await page.getByLabel(/These details are accurate/).check();
  expect(problems).toEqual([]);
});
