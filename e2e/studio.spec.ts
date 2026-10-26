import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFParse } from "pdf-parse";

async function openStudio(page: Page) {
  await page.goto("/studio");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("button", { name: /^My resumes/ })).toBeVisible({ timeout: 20_000 });
}

const paper = (page: Page) => page.locator("[data-resume-paper]");
/** Below the wide layout the panes become a view switcher: bring the one we need to the front. */
async function view(page: Page, v: "Content" | "Preview" | "Design") {
  const tab = page.getByRole("tablist", { name: "Workspace view" }).getByRole("tab", { name: v });
  if (await tab.isVisible()) await tab.click();
}
const content = (page: Page) => view(page, "Content");
const preview = (page: Page) => view(page, "Preview");
const design = (page: Page) => view(page, "Design");
async function loadExample(page: Page) {
  await content(page);
  await page.getByRole("button", { name: "Load example" }).click();
}
const text = async (page: Page) => {
  await preview(page);
  return (await paper(page).innerText()).replace(/\s+/g, " ");
};
const panel = (page: Page, name: RegExp | string) => page.getByRole("button", { name: typeof name === "string" ? new RegExp(`^${name}`) : name }).first();

test.describe("every section can be edited", () => {
  test("starts empty with an example offer, and the example fills everything in", async ({ page }) => {
    await openStudio(page);
    await content(page);
    await expect(page.getByText("New here?")).toBeVisible();
    await loadExample(page);
    expect(await text(page)).toContain("Asha Rao");
    await content(page);
    await expect(page.getByText("New here?")).toHaveCount(0);
  });

  test("basics: name, title, email, phone, location and links appear in the resume", async ({ page }) => {
    await openStudio(page);
    await content(page);
    await page.getByLabel("Full name").fill("Priya Nair");
    await page.getByLabel("Target title (shown under your name)").fill("Data Analyst");
    await page.getByLabel("Email").fill("priya@example.com");
    await page.getByLabel("Phone").fill("+91 99999 11111");
    await page.getByLabel("Location").fill("Kochi, India");
    await page.getByRole("button", { name: "+ Add link" }).click();
    await page.getByLabel("Link 1 URL").fill("https://github.com/priya");
    const t = await text(page);
    for (const s of ["Priya Nair", "Data Analyst", "priya@example.com", "+91 99999 11111", "Kochi, India", "https://github.com/priya"]) expect(t).toContain(s);
  });

  test("Summary, Projects and Certifications (which had no editor before) can be written", async ({ page }) => {
    await openStudio(page);
    await content(page);
    await page.getByLabel("Full name").fill("Priya Nair");
    await page.getByLabel("Email").fill("priya@example.com");

    await panel(page, "Summary").click();
    await page.getByLabel("A short introduction (2 to 3 lines)").fill("Analyst who turns messy data into decisions.");
    await expect(page.getByText("7 words. Aim for 45 or fewer.")).toBeVisible();

    await panel(page, "Projects").click();
    await page.getByRole("button", { name: "+ Add project" }).click();
    await page.getByLabel("Project name").fill("Churn dashboard");
    await page.getByLabel("Technologies, separated by commas").fill("Python, SQL, Tableau");
    await page.getByLabel("Bullet 1", { exact: true }).fill("Built a churn dashboard used by 40 account managers every week");

    await panel(page, "Certifications").click();
    await page.getByRole("button", { name: "+ Add certification" }).click();
    await page.getByLabel("Certification 1", { exact: true }).fill("Google Data Analytics Certificate");

    const t = await text(page);
    expect(t).toContain("Analyst who turns messy data into decisions.");
    expect(t).toContain("Churn dashboard");
    expect(t).toContain("Python, SQL, Tableau");
    expect(t).toContain("Built a churn dashboard used by 40 account managers every week");
    expect(t).toContain("Google Data Analytics Certificate");
    expect(await paper(page).locator("h2").allTextContents()).toEqual(expect.arrayContaining(["Summary", "Projects", "Certifications"]));
  });

  test("experience: add a role, 'currently work here', per-bullet editing with word counts", async ({ page }) => {
    await openStudio(page);
    await content(page);
    await page.getByLabel("Full name").fill("Priya Nair");
    await page.getByLabel("Email").fill("priya@example.com");
    await page.getByRole("button", { name: "+ Add role" }).click();
    await page.getByLabel("Job title").fill("Data Analyst");
    await page.getByLabel("Company").fill("Northwind");
    await page.getByLabel("Start").first().fill("Jan 2022");
    await page.getByLabel("I currently work here").check();
    await expect(page.getByLabel("End").first()).toBeDisabled();
    await page.getByLabel("Bullet 1", { exact: true }).fill("Short");
    await expect(page.getByText("1 words")).toBeVisible();
    await expect(page.getByTitle("Bullets of 8 to 25 words read best")).toBeVisible();
    await page.getByLabel("Bullet 1", { exact: true }).fill("Automated the weekly sales report, saving the team 6 hours every single week");
    await expect(page.getByText("13 words")).toBeVisible();
    await page.getByRole("button", { name: "+ Add bullet" }).click();
    await page.getByLabel("Bullet 2", { exact: true }).fill("Second bullet that is long enough to read well in the preview");
    // reorder bullets, then delete one
    await page.getByRole("button", { name: "Move Bullet 2 up" }).click();
    let t = await text(page);
    expect(t.indexOf("Second bullet")).toBeLessThan(t.indexOf("Automated the weekly"));
    expect(t).toContain("Data Analyst");
    expect(t).toContain("Jan 2022 - Present");
    await content(page);
    await page.getByRole("button", { name: "Delete Bullet 1" }).click();
    t = await text(page);
    expect(t).not.toContain("Second bullet");
  });

  test("education and skills", async ({ page }) => {
    await openStudio(page);
    await content(page);
    await page.getByLabel("Full name").fill("Priya Nair");
    await page.getByLabel("Email").fill("priya@example.com");
    await panel(page, "Education").click();
    await page.getByRole("button", { name: "+ Add education" }).click();
    await page.getByLabel("School", { exact: true }).fill("Cochin University");
    await page.getByLabel("Degree", { exact: true }).fill("B.Sc. Statistics");
    await page.getByLabel("Details (grade, honours)").fill("First class");
    await panel(page, "Skills").click();
    await page.getByRole("button", { name: "+ Add skill group" }).click();
    await page.getByLabel("Group name").first().fill("Tools");
    await page.getByLabel("Skills, separated by commas").first().fill("Excel, Power BI, SQL");
    const t = await text(page);
    expect(t).toContain("Cochin University");
    expect(t).toContain("B.Sc. Statistics");
    expect(t).toContain("First class");
    expect(t).toContain("Tools: Excel, Power BI, SQL");
  });

  test("inline validation explains bad email and bad links without blocking typing", async ({ page }) => {
    await openStudio(page);
    await content(page);
    await page.getByLabel("Email").fill("not-an-email");
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await page.getByLabel("Email").fill("ok@example.com");
    await expect(page.getByText("Enter a valid email address")).toHaveCount(0);
    await page.getByRole("button", { name: "+ Add link" }).click();
    await page.getByLabel("Link 1 URL").fill("javascript:alert(1)");
    await expect(page.getByText("Use a full https:// link")).toBeVisible();
  });
});

test.describe("reorder, duplicate, delete and undo", () => {
  test("roles move with the arrows and the resume follows; duplicate and delete work", async ({ page }) => {
    await openStudio(page);
    await loadExample(page);
    await content(page);
    const order = async () => { const t = await text(page); return t.indexOf("Acme Corp") < t.indexOf("Globex") ? "acme-first" : "globex-first"; };
    expect(await order()).toBe("acme-first");
    await content(page);
    await page.getByRole("button", { name: /^Move Role 1: .* down$/ }).click();
    expect(await order()).toBe("globex-first");
    await content(page);
    await page.getByRole("button", { name: /^Duplicate Role/ }).first().click();
    expect((await text(page)).match(/Globex/g)).toHaveLength(2);
    await content(page);
    await page.getByRole("button", { name: /^Delete Role 1/ }).click();
    expect((await text(page)).match(/Globex/g)).toHaveLength(1);
  });

  test("drag and drop reorders roles with a real mouse", async ({ page, isMobile }) => {
    test.skip(isMobile, "pointer dragging is exercised on desktop; mobile uses the arrow buttons");
    await openStudio(page);
    await loadExample(page);
    // Centre the list. (In dev mode the Next.js indicator bubble floats over the bottom-left corner and would catch the mouse.)
    await page.getByRole("list", { name: "Roles", exact: true }).evaluate((el) => el.scrollIntoView({ block: "center" }));
    const from = (await page.getByRole("button", { name: /^Drag Role 2/ }).boundingBox())!;
    const to = (await page.getByRole("button", { name: /^Drag Role 1/ }).boundingBox())!;
    const x = from.x + from.width / 2, y0 = from.y + from.height / 2, y1 = to.y - 6;
    await page.mouse.move(x, y0);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) { await page.mouse.move(x, y0 + ((y1 - y0) * i) / 20); await page.waitForTimeout(25); }
    await page.mouse.up();
    await expect.poll(async () => { const t = await text(page); return t.indexOf("Globex") < t.indexOf("Acme Corp"); }).toBe(true);
  });

  test("undo and redo step back through edits (buttons and keyboard)", async ({ page }) => {
    await openStudio(page);
    await loadExample(page);
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
    // one edit, outside the debounce window of the previous one
    await content(page);
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: /^Delete Role 1/ }).click();
    expect(await text(page)).not.toContain("Acme Corp");
    await page.getByRole("button", { name: "Undo" }).click();
    expect(await text(page)).toContain("Acme Corp");
    await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();
    await page.getByRole("button", { name: "Redo" }).click();
    expect(await text(page)).not.toContain("Acme Corp");
    // keyboard: Ctrl+Z when focus is not in a text field
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+z");
    expect(await text(page)).toContain("Acme Corp");
  });

  test("Ctrl+Z inside a text box is left to the browser (it must not undo the whole resume)", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard shortcut");
    await openStudio(page);
    await loadExample(page);
    await page.getByLabel("Full name").fill("Changed Name");
    expect(await text(page)).toContain("Changed Name");
    await content(page);
    await page.getByLabel("Full name").focus();
    await page.keyboard.press("Control+z");
    // The browser's own undo handled the keystroke inside the field. Had our shortcut fired instead, the whole
    // example would have been undone and the resume would now be empty.
    expect(await text(page)).toContain("Acme Corp");
  });

  test("typing is undone as one step, not one letter at a time", async ({ page }) => {
    await openStudio(page);
    await content(page);
    await page.getByLabel("Full name").pressSequentially("Jonathan", { delay: 20 });
    expect(await text(page)).toContain("Jonathan");
    await page.getByRole("button", { name: "Undo" }).click();
    expect(await text(page)).not.toContain("Jon");
  });
});

test.describe("layout panes and design tools", () => {
  test("the right-hand tabs change the live resume", async ({ page }) => {
    await openStudio(page);
    await loadExample(page);
    await design(page);
    await page.getByRole("tab", { name: "Templates" }).click();
    await page.getByRole("radio", { name: /^Curve/ }).click();
    await preview(page);
    await expect(paper(page).locator("h1")).toHaveText("ASHA RAO");
    await design(page);
    await page.getByRole("tab", { name: "Style & layout" }).click();
    await page.getByLabel("Heading for Experience").fill("Work History");
    await preview(page);
    expect(await paper(page).locator("h2").allTextContents()).toContain("Work History");
  });

  test("zoom changes the paper width", async ({ page }) => {
    await openStudio(page);
    await loadExample(page);
    await preview(page);
    const w = () => paper(page).evaluate((el) => el.getBoundingClientRect().width);
    const fit = await w();
    await page.getByRole("button", { name: "160%", exact: true }).click();
    await expect.poll(w).toBeGreaterThan(fit * 1.3);
  });

  test("Job & AI tab: paste a job description, see keywords, tailor with AI (mocked) and confirm", async ({ page }) => {
    await openStudio(page);
    await loadExample(page);
    await page.route("**/api/v1/tailor", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      body.profile.experience[0].bullets = ["Engineered high-traffic React dashboards serving 5,000 active users by optimizing architecture"];
      await route.fulfill({ json: { resume: body.profile, issues: [], questions: [], ledger: [{ roleId: body.profile.experience[0].id, position: 0, text: body.profile.experience[0].bullets[0], from: 0, original: "Rebuilt checkout in React and TypeScript, lifting conversion 14% across 2M monthly users", needsMetric: false, status: "needs-confirmation", reasons: ['New wording not in your original: "engineered".'] }] } });
    });
    await design(page);
    await page.getByRole("tab", { name: "Job & AI" }).click();
    await page.getByLabel("Paste the job description").fill("Senior Frontend Engineer building React and TypeScript apps with Next.js and AWS. Docker required.");
    await expect(page.getByText("Keywords we found")).toBeVisible();
    await page.getByRole("button", { name: "Tailor with AI" }).click();
    const confirm = page.getByRole("region", { name: "Bullets to confirm" });
    await expect(confirm).toContainText("AI wrote");
    await confirm.getByRole("button", { name: "Use my original" }).click();
    expect(await text(page)).toContain("Rebuilt checkout in React and TypeScript");
  });

  test("the printed PDF comes from the workspace and contains the edits and nothing else", async ({ page }) => {
    await openStudio(page);
    await loadExample(page);
    await content(page);
    await page.getByLabel("Location").fill("Remote, India");
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const p = new PDFParse({ data: pdf });
    const { text: t, total } = await p.getText();
    await p.destroy();
    expect(total).toBe(1);
    expect(t).toContain("Remote, India");
    expect(t).toContain("Acme Corp");
    for (const ui of ["Undo", "Guided mode", "Load example", "Basics", "Saved in this browser"]) expect(t).not.toContain(ui);
  });

  test("small screens get a Content / Preview / Design switcher; wide screens show all three panes", async ({ page, isMobile }) => {
    await openStudio(page);
    await loadExample(page);
    const switcher = page.getByRole("tablist", { name: "Workspace view" });
    if (isMobile) {
      await expect(switcher).toBeVisible();
      await expect(page.getByRole("complementary", { name: "Resume content" })).toBeVisible();
      await expect(page.getByRole("main", { name: "Resume preview" })).toBeHidden();
      await switcher.getByRole("tab", { name: "Preview" }).click();
      await expect(paper(page)).toBeVisible();
      await switcher.getByRole("tab", { name: "Design" }).click();
      await expect(page.getByRole("tablist", { name: "Design tools" })).toBeVisible();
    } else {
      await expect(switcher).toBeHidden();
      await expect(page.getByRole("complementary", { name: "Resume content" })).toBeVisible();
      await expect(paper(page)).toBeVisible();
      await expect(page.getByRole("tablist", { name: "Design tools" })).toBeVisible();
    }
  });
});

test.describe("several resumes", () => {
  const openManager = async (page: Page) => { await page.getByRole("button", { name: /^My resumes/ }).click(); return page.getByRole("dialog", { name: "My resumes" }); };

  test("create, switch, rename, duplicate and delete; the active resume survives a reload", async ({ page }) => {
    await openStudio(page);
    await loadExample(page);
    await page.waitForTimeout(700);

    let dlg = await openManager(page);
    await dlg.getByLabel("New resume name").fill("Product manager");
    await dlg.getByRole("button", { name: "New blank resume" }).click();
    await expect(page.getByRole("button", { name: /^My resumes. Current: Product manager/ })).toBeVisible();
    await content(page);
    await expect(page.getByLabel("Full name")).toHaveValue(""); // the new resume is blank
    await page.getByLabel("Full name").fill("Second Person");
    await page.waitForTimeout(700);

    dlg = await openManager(page);
    await expect(dlg.getByRole("listitem")).toHaveCount(2);
    await dlg.getByRole("button", { name: "Open Untitled resume" }).click();
    await content(page);
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao"); // the first resume is intact

    // rename
    dlg = await openManager(page);
    const ren = dlg.getByLabel("Rename Untitled resume");
    await ren.fill("Frontend roles");
    await ren.press("Enter");
    await expect(dlg.getByLabel("Rename Frontend roles")).toBeVisible();

    // duplicate -> becomes active, with the same content
    await dlg.getByRole("button", { name: "Duplicate Frontend roles" }).click();
    await expect(page.getByRole("button", { name: /^My resumes. Current: Frontend roles copy/ })).toBeVisible();
    await content(page);
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");

    // reload: the active resume (the copy) is restored
    await page.waitForTimeout(700);
    await page.reload();
    await content(page);
    await expect(page.getByRole("button", { name: /^My resumes. Current: Frontend roles copy/ })).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");

    // delete needs a confirmation; cancel keeps it, confirm removes it
    dlg = await openManager(page);
    await dlg.getByRole("button", { name: "Delete Frontend roles copy" }).click();
    await dlg.getByRole("button", { name: "Cancel" }).click();
    await expect(dlg.getByRole("listitem")).toHaveCount(3);
    await dlg.getByRole("button", { name: "Delete Frontend roles copy" }).click();
    await dlg.getByRole("button", { name: /^Yes, delete/ }).click();
    await expect(dlg.getByRole("listitem")).toHaveCount(2);
  });

  test("the last resume cannot be deleted", async ({ page }) => {
    await openStudio(page);
    const dlg = await openManager(page);
    await expect(dlg.getByRole("listitem")).toHaveCount(1);
    await expect(dlg.getByRole("button", { name: /^Delete / })).toBeDisabled();
  });

  test("export then import round-trips a resume exactly; bad files are rejected clearly", async ({ page }) => {
    await openStudio(page);
    await loadExample(page);
    await content(page);
    await page.getByLabel("Location").fill("Pune, India");
    let dlg = await openManager(page);
    const [dl] = await Promise.all([page.waitForEvent("download"), dlg.getByRole("button", { name: "Export this resume (.json)" }).click()]);
    const file = readFileSync(await dl.path());
    expect(dl.suggestedFilename()).toMatch(/\.json$/);
    const json = JSON.parse(file.toString("utf8"));
    expect(json.format).toBe("tomcredora-resume");
    expect(json.resume.contact.location).toBe("Pune, India");

    await dlg.getByLabel("Import a .json backup").setInputFiles({ name: "Backup copy.json", mimeType: "application/json", buffer: file });
    await expect(page.getByRole("button", { name: /^My resumes. Current: Untitled resume 2/ })).toBeVisible();
    await content(page);
    await expect(page.getByLabel("Location")).toHaveValue("Pune, India");
    expect(await text(page)).toContain("Pune, India");

    dlg = await openManager(page);
    await dlg.getByLabel("Import a .json backup").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("this is not json") });
    await expect(dlg.getByRole("alert")).toContainText("not valid JSON");
    await dlg.getByLabel("Import a .json backup").setInputFiles({ name: "empty.json", mimeType: "application/json", buffer: Buffer.from("{}") });
    await expect(dlg.getByRole("alert")).toContainText("No valid resume");
    // A hostile file is not rejected for its extra field any more: unknown fields are dropped, the rest is plain text.
    await dlg.getByLabel("Import a .json backup").setInputFiles({ name: "evil.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ resume: { contact: { fullName: "<script>window.__pwned=1</script>", email: "a@b.co", isAdmin: true } } })) });
    await expect(page.getByRole("button", { name: /^My resumes. Current: evil/ })).toBeVisible();
    await content(page);
    await expect(page.getByLabel("Full name")).toHaveValue("<script>window.__pwned=1</script>"); // shown literally, as text
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await expect(page.locator("[data-resume-paper] script")).toHaveCount(0);
    await page.waitForTimeout(800);
    const stored = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith("arb.resume.")).map(([, v]) => v).join(""));
    expect(stored).not.toContain("isAdmin"); // the unknown field never reached storage
  });

  test("a draft from the earlier single-resume version is kept, as 'My resume'", async ({ page }) => {
    await page.goto("/studio");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("arb.draft.v1", JSON.stringify({ resume: { contact: { fullName: "Legacy Person", email: "legacy@example.com", headline: "", phone: "", location: "", links: [] }, summary: "From the old version.", skills: [], experience: [], projects: [], education: [], certifications: [] }, jd: "old jd", template: { id: "classic" } }));
    });
    await page.reload();
    await expect(page.getByRole("button", { name: /^My resumes. Current: My resume/ })).toBeVisible({ timeout: 20_000 });
    await content(page);
    await expect(page.getByLabel("Full name")).toHaveValue("Legacy Person");
    expect(await text(page)).toContain("From the old version.");
  });

  test("corrupted storage does not break the workspace", async ({ page }) => {
    await page.goto("/studio");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("arb.workspace.v1", "{broken"); localStorage.setItem("arb.draft.v1", "[1,2"); });
    await page.reload();
    await expect(page.getByRole("button", { name: /^My resumes/ })).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });
});

test.describe("shares its data with the guided mode", () => {
  test("edit in the workspace, continue in the guided builder, and back", async ({ page }) => {
    await openStudio(page);
    await content(page);
    await page.getByLabel("Full name").fill("Shared Person");
    await page.getByLabel("Email").fill("shared@example.com");
    await page.waitForTimeout(700);
    await page.getByRole("link", { name: "Guided mode" }).click();
    await expect(page).toHaveURL(/\/build/);
    await expect(page.getByLabel("Full name")).toHaveValue("Shared Person");
    await page.getByLabel("Location").fill("Chennai, India");
    await page.waitForTimeout(700);
    await page.goto("/studio");
    await content(page);
    await expect(page.getByLabel("Location")).toHaveValue("Chennai, India");
  });
});

test.describe("accessibility", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`workspace, panels and the resumes dialog pass the axe scan (${scheme})`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme: scheme });
      await openStudio(page);
      await loadExample(page);
      const settle = () => page.evaluate(() => Promise.all(document.getAnimations().filter((x) => x.effect?.getComputedTiming().iterations !== Infinity).map((x) => x.finished.catch(() => undefined))));
      const scan = async (label: string) => {
        await settle();
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();
        const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 110)}`), label).toEqual([]);
      };
      await content(page);
      await page.getByRole("button", { name: /^Role 1|^Senior Frontend Engineer at Acme Corp/ }).first().click().catch(() => undefined);
      await scan("content");
      await design(page);
      for (const t of ["Templates", "Style & layout", "Job & AI", "Export"]) {
        await page.getByRole("tab", { name: t }).click();
        await scan(t);
      }
      await page.getByRole("button", { name: /^My resumes/ }).click({ trial: false }).catch(async () => { await content(page); await page.getByRole("button", { name: /^My resumes/ }).click(); });
      await scan("resumes dialog");
    });
  }
});
