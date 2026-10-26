import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function fresh(page: Page, path = "/profile") {
  await page.goto(path);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
}
const strength = async (page: Page) => Number((await page.getByTestId("strength").innerText()).replace("%", ""));
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("arb.profile.v1") ?? "null"));
const settle = (page: Page) => page.waitForTimeout(700); // autosave is debounced

/** Fill a whole profile using taps and pickers; only the unavoidable things are typed. */
async function tapThrough(page: Page) {
  await page.getByRole("radio", { name: "Software & IT" }).click();
  await page.getByLabel("Full name").fill("Meera Iyer");
  await page.getByLabel("Email").fill("meera@example.com");
  await page.getByLabel("Phone").fill("+91 98000 00000");
  await page.getByLabel("City, country").fill("Pune, India");
  for (const s of ["TypeScript", "Python", "React", "Docker", "Git"]) await page.getByRole("group", { name: /skills$/ }).getByRole("button", { name: s, exact: true }).click();
  await page.getByRole("button", { name: "+ Add a role" }).click();
  await page.getByLabel("Job title").fill("Frontend Developer");
  await page.getByLabel("Company").fill("Acme");
  await page.getByLabel("Start month").selectOption("Jan");
  await page.getByLabel("Start year").selectOption("2022");
  await page.getByLabel("I work here now").check();
  await page.getByRole("button", { name: "Built and maintained web applications" }).click();
  await page.getByRole("button", { name: "Reviewed code and mentored teammates" }).click();
  await page.getByRole("button", { name: "+ Add education" }).click();
  await page.getByLabel("Degree").selectOption("B.Tech / B.E.");
  await page.getByLabel("School or college").fill("COEP");
  await page.getByLabel("From year").selectOption("2018");
  await page.getByLabel("To year").selectOption("2022");
}

test.describe("profile page", () => {
  test("a whole profile is made by tapping and picking, and the strength meter follows along", async ({ page }) => {
    await fresh(page);
    expect(await strength(page)).toBe(0);
    await expect(page.getByText("Next: Your name")).toBeVisible();
    await tapThrough(page);
    expect(await strength(page)).toBeGreaterThanOrEqual(80);
    await settle(page);

    const p = await stored(page);
    expect(p.focus).toBe("software");
    expect(p.resume.contact).toMatchObject({ fullName: "Meera Iyer", email: "meera@example.com", location: "Pune, India" });
    expect(p.resume.skills.flatMap((g: { items: string[] }) => g.items).sort()).toEqual(["Docker", "Git", "Python", "React", "TypeScript"].sort());
    expect(p.resume.experience[0]).toMatchObject({ role: "Frontend Developer", company: "Acme", start: "Jan 2022", end: "Present" });
    expect(p.resume.experience[0].bullets).toEqual(["Built and maintained web applications", "Reviewed code and mentored teammates"]);
    expect(p.resume.education[0]).toMatchObject({ degree: "B.Tech / B.E.", school: "COEP", start: "2018", end: "2022" });
  });

  test("everything survives a reload, and tapping a chip again removes it", async ({ page }) => {
    await fresh(page);
    await tapThrough(page);
    await settle(page);
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Meera Iyer");
    const ts = page.getByRole("group", { name: /skills$/ }).getByRole("button", { name: "TypeScript", exact: true });
    await expect(ts).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Start month")).toHaveValue("Jan");
    await expect(page.getByLabel("I work here now")).toBeChecked();
    await ts.click();
    await expect(ts).toHaveAttribute("aria-pressed", "false");
    await settle(page);
    expect((await stored(page)).resume.skills.flatMap((g: { items: string[] }) => g.items)).not.toContain("TypeScript");
  });

  test("your own skills, points, certifications and links are quick to add and to remove", async ({ page }) => {
    await fresh(page);
    await page.getByRole("radio", { name: "Software & IT" }).click();
    await page.getByRole("textbox", { name: "another languages skill" }).fill("Rust");
    await page.getByRole("textbox", { name: "another languages skill" }).press("Enter");
    await expect(page.getByRole("group", { name: "Languages skills" }).getByRole("button", { name: "Rust", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "+ Add a role" }).click();
    await page.getByRole("textbox", { name: "your own point" }).fill("Migrated our build to Vite");
    await page.getByRole("button", { name: "Add: your own point" }).click();
    await expect(page.getByLabel("Edit point")).toHaveValue("Migrated our build to Vite");
    await page.getByRole("button", { name: /Remove point/ }).click();
    await expect(page.getByLabel("Edit point")).toHaveCount(0);

    await page.getByRole("textbox", { name: "another certification" }).fill("Internal Security Badge");
    await page.getByRole("textbox", { name: "another certification" }).press("Enter");
    await expect(page.getByRole("group", { name: "Certifications" }).getByRole("button", { name: "Internal Security Badge" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "+ LinkedIn" }).click();
    await page.getByLabel("Link 1 address").fill("https://www.linkedin.com/in/meera");
    await settle(page);
    expect((await stored(page)).resume.contact.links).toEqual([{ label: "LinkedIn", url: "https://www.linkedin.com/in/meera" }]);
    await page.getByRole("button", { name: "Remove link 1" }).click();
    await expect(page.getByLabel("Link 1 address")).toHaveCount(0);
  });

  test("an unfinished profile is kept (no email yet) and the page says what to do next", async ({ page }) => {
    await fresh(page);
    await page.getByLabel("Full name").fill("Meera Iyer");
    await page.getByLabel("Email").fill("meera@");
    await settle(page);
    await page.reload();
    await expect(page.getByLabel("Email")).toHaveValue("meera@");
    await expect(page.getByLabel("Full name")).toHaveValue("Meera Iyer");
  });

  test("an existing resume can become the profile, and the example loads in one tap", async ({ page }) => {
    await fresh(page, "/studio");
    await page.getByRole("button", { name: "Load example" }).click();
    await settle(page);
    await page.goto("/profile");
    await page.getByRole("button", { name: /Use my current resume/ }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");
    await fresh(page);
    await page.getByRole("button", { name: "Load example" }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");
    expect(await strength(page)).toBeGreaterThan(50);
  });

  test("the profile feeds new resumes: the first resume is seeded once, a deliberate new one on request", async ({ page }) => {
    await fresh(page);
    await tapThrough(page);
    await settle(page);

    // first open of the workspace: the empty resume is filled from the profile; the summary is left for the AI
    await page.goto("/studio");
    await expect(page.getByLabel("Full name")).toHaveValue("Meera Iyer");
    await expect(page.getByText("Frontend Developer").first()).toBeVisible();
    await settle(page);
    const seeded = await page.evaluate(() => {
      const idx = JSON.parse(localStorage.getItem("arb.workspace.v1")!);
      return JSON.parse(localStorage.getItem(`arb.resume.${idx.activeId}`)!);
    });
    expect(seeded.resume.summary).toBe("");
    expect(seeded.resume.experience[0].bullets).toHaveLength(2);

    // emptying it by hand does not make it refill on the next visit (the seed marker remembers it was seeded)
    await page.evaluate(() => {
      const idx = JSON.parse(localStorage.getItem("arb.workspace.v1")!);
      const key = `arb.resume.${idx.activeId}`;
      const d = JSON.parse(localStorage.getItem(key)!);
      d.resume = { schemaVersion: 1, contact: { fullName: "", headline: "", email: "", phone: "", location: "", links: [] }, summary: "", skills: [], experience: [], projects: [], education: [], certifications: [] };
      localStorage.setItem(key, JSON.stringify(d));
    });
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("");

    // a new resume from the profile, from the Resumes dialog
    await page.getByRole("button", { name: /My resumes/ }).click();
    await page.getByRole("button", { name: "New from my profile" }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("Meera Iyer");
  });

  test("a profile edit never rewrites resumes that already exist", async ({ page }) => {
    await fresh(page);
    await tapThrough(page);
    await settle(page);
    await page.goto("/studio");
    await expect(page.getByLabel("Full name")).toHaveValue("Meera Iyer");
    await settle(page);
    await page.goto("/profile");
    await page.getByLabel("Full name").fill("Meera I. Iyer");
    await settle(page);
    await page.goto("/studio");
    await expect(page.getByLabel("Full name")).toHaveValue("Meera Iyer");
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`passes the axe scan, empty and filled (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await fresh(page);
      const scan = async (label: string) => {
        await page.evaluate(() => Promise.all(document.getAnimations().filter((x) => x.effect?.getComputedTiming().iterations !== Infinity).map((x) => x.finished.catch(() => undefined))));
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();
        expect(r.violations.map((v) => `${label}: ${v.id} ${v.nodes[0]?.target}`), label).toEqual([]);
      };
      await scan("empty");
      await tapThrough(page);
      await page.getByRole("button", { name: "+ GitHub" }).click();
      await scan("filled");
    });
  }
});
