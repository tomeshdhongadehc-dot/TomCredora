import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * A real person's account, end to end: sign in, enter and edit everything, make a resume for a job, track it, write a
 * cover letter, then open a second device and check that all of it came back exactly, and that edits made there
 * reach the first device. Sign-in is the test-only one (AUTH_MODE=mock); each "device" is its own browser context.
 */
const unique = () => `u${Math.random().toString(36).slice(2, 8)}@example.com`;
const slug = (email: string) => email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const token = (email: string) => `mock.${slug(email)}.x`;
const baseOf = () => test.info().project.use.baseURL as string;
const dialog = (page: Page) => page.getByRole("dialog");
const settle = (page: Page) => page.waitForTimeout(900); // autosave is debounced

async function device(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ baseURL: baseOf() });
  return { ctx, page: await ctx.newPage() };
}
async function signIn(page: Page, email: string) {
  const from = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/signin\?next=/);
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${from.replace(/\//g, "\\/")}$`), { timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Account:/ })).toBeVisible();
}
async function syncNow(page: Page) {
  await page.getByRole("button", { name: /Account:/ }).click();
  await dialog(page).getByRole("button", { name: "Sync now" }).click();
  await expect(dialog(page).getByRole("status")).toContainText(/Synced/, { timeout: 15_000 });
  await dialog(page).getByRole("button", { name: "Close" }).click();
}
const cloud = async (page: Page, email: string) => {
  const r = await page.request.get("/api/v1/sync", { headers: { authorization: `Bearer ${token(email)}` } });
  return r.status() === 200 ? (await r.json()).snapshot : null;
};
async function fresh(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
}
const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker required. Mentor juniors.";
const RESUME_TEXT = `Asha Rao
Senior Frontend Engineer
Bengaluru, India | asha.rao@example.com | +91 98765 43210
linkedin.com/in/asharao

EXPERIENCE
Senior Frontend Engineer
Acme Corp, Bengaluru    Jan 2021 - Present
• Rebuilt checkout in React and TypeScript, cutting load time by 38%
• Mentored four junior engineers
Frontend Developer
Globex    06/2018 - 12/2020
• Shipped a design system used by 12 teams

EDUCATION
B.Tech in Computer Science, VTU    2014 - 2018

SKILLS
Languages: JavaScript, TypeScript, Python
Tools: Git, Docker`;
const LETTER = ["I build React and TypeScript applications and the role you describe is close to my daily work.", "At Acme Corp I rebuilt checkout in React and TypeScript and mentored other engineers along the way.", "I would welcome a conversation about the role."];

async function mocks(page: Page) {
  await page.route("**/api/v1/tailor", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({ json: { resume: { ...body.profile, summary: "Frontend engineer focused on React and TypeScript." }, issues: [], questions: [], ledger: [] } });
  });
  await page.route("**/api/v1/cover-letter", (route) => route.fulfill({ json: { paragraphs: LETTER, warnings: [] } }));
}

test.describe("a real person's account", () => {
  test("everything made on one device is there on another, editable, and edits travel back", async ({ page, browser }) => {
    const email = unique();
    await mocks(page);
    await fresh(page, "/quick");
    await signIn(page, email);

    // bring in an existing resume, then make a resume for a job
    await page.getByRole("button", { name: "Import my resume" }).click();
    await page.getByLabel("Or paste the text of your resume").fill(RESUME_TEXT);
    await page.getByRole("button", { name: "Read my resume" }).click();
    await page.getByRole("button", { name: "Use this as my profile" }).click();
    await page.getByLabel("Job title (optional)").fill("Senior Frontend Engineer");
    await page.getByLabel("Company (optional)").fill("Acme Corp");
    await page.getByLabel("Paste the job description").fill(JD);
    await page.getByLabel(/These details are accurate/).check();
    await page.getByRole("button", { name: /Create (my resume|again)/ }).click();
    await expect(page.getByLabel("Your resume", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Write my cover letter" }).click();
    const box = page.getByLabel("Your letter (you can edit it)");
    await expect(box).toHaveValue(/Dear Acme Corp hiring team,/);
    await box.fill((await box.inputValue()).replace("Dear Acme Corp hiring team,", "Dear Priya,"));
    // make it again: the first result is kept as an earlier version
    await page.getByLabel("Paste the job description").fill(JD + " ");
    await page.getByRole("button", { name: /Create (my resume|again)/ }).click();
    await expect(page.getByRole("list", { name: "Earlier versions" })).toBeVisible({ timeout: 20_000 });

    // track it
    await page.goto("/jobs");
    const row = page.getByRole("list", { name: "Applications" }).getByRole("listitem").first();
    await row.getByLabel("Stage").selectOption("applied");
    await row.getByLabel("Notes").fill("Referred by Rahul");
    await row.getByLabel("Notes").blur();
    await settle(page);
    await syncNow(page);

    // what the server holds
    const snap = await cloud(page, email);
    expect(snap.profile.data.resume.contact.fullName).toBe("Asha Rao");
    const made = snap.resumes.find((r: { draft: { job: unknown } }) => r.draft.job);
    expect(made.draft.job).toMatchObject({ title: "Senior Frontend Engineer", company: "Acme Corp", status: "applied", note: "Referred by Rahul" });
    expect(made.draft.letter).toContain("Dear Priya,");
    expect(made.draft.versions.length).toBe(1);
    expect(made.draft.jd).toContain("Senior Frontend Engineer");

    // a different device, signed in to the same account
    const b = await device(browser);
    await mocks(b.page);
    await b.page.goto("/jobs");
    await expect(b.page.getByText("Nothing here yet")).toBeVisible();
    await signIn(b.page, email);
    const rowB = b.page.getByRole("list", { name: "Applications" }).getByRole("listitem").first();
    await expect(rowB).toContainText("Senior Frontend Engineer", { timeout: 15_000 });
    await expect(rowB).toContainText("Acme Corp");
    await expect(rowB.getByLabel("Stage")).toHaveValue("applied");
    await expect(rowB.getByLabel("Notes")).toHaveValue("Referred by Rahul");
    // the exact resume, the cover letter and the earlier version are all there
    await rowB.getByRole("button", { name: "Open this resume" }).click();
    await expect(b.page).toHaveURL(/\/studio$/);
    await b.page.goto("/quick");
    await expect(b.page.getByLabel("Paste the job description")).toHaveValue(/Senior Frontend Engineer/);
    await expect(b.page.getByLabel("Your letter (you can edit it)")).toHaveValue(/Dear Priya,/);
    await expect(b.page.getByRole("list", { name: "Earlier versions" }).getByRole("listitem")).toHaveCount(1);
    await expect(b.page.getByLabel("Your resume", { exact: true })).toContainText("Asha Rao");
    // the profile came across with every detail
    await b.page.goto("/profile");
    await expect(b.page.getByLabel("Full name")).toHaveValue("Asha Rao");
    await expect(b.page.getByLabel("Email")).toHaveValue("asha.rao@example.com");
    await expect(b.page.getByLabel("Phone")).toHaveValue("98765 43210");
    await expect(b.page.getByLabel("Role 1").getByLabel("Company")).toHaveValue(/Acme Corp/);

    // edit on the second device: profile, note and letter
    await b.page.getByLabel("Phone").fill("+91 90000 11111");
    await settle(b.page);
    await b.page.goto("/jobs");
    const rowB2 = b.page.getByRole("list", { name: "Applications" }).getByRole("listitem").first();
    await rowB2.getByLabel("Stage").selectOption("interview");
    await rowB2.getByLabel("Notes").fill("Interview on Friday 10am");
    await rowB2.getByLabel("Notes").blur();
    await settle(b.page);
    await rowB2.getByRole("button", { name: "Open this resume" }).click();
    await b.page.goto("/quick");
    const boxB = b.page.getByLabel("Your letter (you can edit it)");
    await boxB.fill((await boxB.inputValue()) + "\nP.S. Happy to share a portfolio.");
    await settle(b.page);
    await syncNow(b.page);

    // ...and the first device sees them
    await page.goto("/profile");
    await syncNow(page);
    await expect(page.getByLabel("Phone")).toHaveValue("90000 11111", { timeout: 15_000 });
    await page.goto("/jobs");
    const rowA = page.getByRole("list", { name: "Applications" }).getByRole("listitem").first();
    await expect(rowA.getByLabel("Stage")).toHaveValue("interview");
    await expect(rowA.getByLabel("Notes")).toHaveValue("Interview on Friday 10am");
    await rowA.getByRole("button", { name: "Open this resume" }).click();
    await page.goto("/quick");
    await expect(page.getByLabel("Your letter (you can edit it)")).toHaveValue(/Happy to share a portfolio/);

    // wiping this browser is not a disaster: signing in brings it all back
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto("/jobs");
    await expect(page.getByText("Nothing here yet")).toBeVisible();
    await signIn(page, email);
    const back = page.getByRole("list", { name: "Applications" }).getByRole("listitem").first();
    await expect(back).toContainText("Senior Frontend Engineer", { timeout: 15_000 });
    await expect(back.getByLabel("Notes")).toHaveValue("Interview on Friday 10am");
    await b.ctx.close();
  });

  test("every profile field can be edited, survives a reload, and reaches the account and a second device", async ({ page, browser }) => {
    const email = unique();
    await fresh(page, "/profile");
    await signIn(page, email);

    await page.getByLabel("Full name").fill("Meera Iyer");
    await page.getByLabel("Email", { exact: true }).fill("meera.iyer@example.com");
    await page.getByLabel("Phone").fill("+91 91234 56789");
    await page.getByLabel("City, country").fill("Pune, India");
    await page.getByLabel("Your title (optional)").fill("Data Analyst");
    await page.getByRole("button", { name: "+ LinkedIn" }).click();
    await page.getByLabel("Link 1 address").fill("https://linkedin.com/in/meeraiyer");
    await page.getByRole("button", { name: "+ Add a role" }).click();
    const role = page.getByLabel("Role 1");
    await role.getByLabel("Job title").fill("Data Analyst");
    await role.getByLabel("Company").fill("Initech");
    await role.getByLabel("City", { exact: true }).fill("Pune");
    await role.getByLabel("Start month").selectOption({ index: 2 });
    await role.getByLabel("Start year").selectOption({ index: 3 });
    await role.getByRole("textbox", { name: "your own point" }).fill("Built a weekly sales dashboard used by 40 managers");
    await role.getByRole("button", { name: "Add: your own point" }).click();
    await page.getByRole("button", { name: "+ Add education" }).click();
    const edu = page.getByLabel("Education 1");
    await edu.getByLabel("School or college").fill("Pune University");
    await edu.getByLabel("From year").selectOption({ index: 5 });
    await edu.getByLabel("To year").selectOption({ index: 2 });
    await page.getByRole("button", { name: "+ Add a project" }).click();
    await page.getByLabel("Project name").fill("Sales Radar");
    await page.getByLabel("What it does (one line)").fill("Flags weekly sales drops early");
    await page.getByRole("group", { name: "Add a link" }).getByRole("button", { name: "+ GitHub" }).click();
    await page.getByLabel("Link 2 address").fill("https://github.com/meera");
    await settle(page);
    await syncNow(page);

    const check = async (p: Page) => {
      await expect(p.getByLabel("Full name")).toHaveValue("Meera Iyer");
      await expect(p.getByLabel("Email", { exact: true })).toHaveValue("meera.iyer@example.com");
      await expect(p.getByLabel("Phone")).toHaveValue("91234 56789");
      await expect(p.getByLabel("City, country")).toHaveValue("Pune, India");
      await expect(p.getByLabel("Your title (optional)")).toHaveValue("Data Analyst");
      await expect(p.getByLabel("Link 1 address")).toHaveValue("https://linkedin.com/in/meeraiyer");
      await expect(p.getByLabel("Link 2 address")).toHaveValue("https://github.com/meera");
      await expect(p.getByLabel("Role 1").getByLabel("Job title")).toHaveValue("Data Analyst");
      await expect(p.getByLabel("Role 1").getByLabel("Company")).toHaveValue("Initech");
      await expect(p.getByLabel("Role 1").getByLabel("City", { exact: true })).toHaveValue("Pune");
      await expect(p.getByLabel("Role 1").getByLabel("Edit point")).toHaveValue("Built a weekly sales dashboard used by 40 managers");
      await expect(p.getByLabel("Education 1").getByLabel("School or college")).toHaveValue("Pune University");
      await expect(p.getByLabel("Project name")).toHaveValue("Sales Radar");
      await expect(p.getByLabel("What it does (one line)")).toHaveValue("Flags weekly sales drops early");
    };
    await check(page);
    await page.reload();
    await check(page); // after a reload on the same device

    const snap = await cloud(page, email);
    const text = JSON.stringify(snap.profile);
    for (const v of ["Meera Iyer", "meera.iyer@example.com", "+91 91234 56789", "Pune, India", "Initech", "Pune University", "Sales Radar", "weekly sales dashboard"]) expect(text, v).toContain(v);

    const b = await device(browser);
    await b.page.goto("/profile");
    await signIn(b.page, email);
    await expect(b.page.getByLabel("Full name")).toHaveValue("Meera Iyer", { timeout: 15_000 });
    await check(b.page); // on another device

    // edit and remove things on the second device; the first sees exactly that
    await b.page.getByLabel("Role 1").getByLabel("Company").fill("Initech Global");
    await b.page.getByLabel("Role 1").getByRole("button", { name: /^Remove point:/ }).click();
    await b.page.getByRole("button", { name: "Remove project 1" }).click();
    await b.page.getByRole("button", { name: "Remove link 2" }).click();
    await settle(b.page);
    await syncNow(b.page);
    await syncNow(page);
    await expect(page.getByLabel("Role 1").getByLabel("Company")).toHaveValue("Initech Global", { timeout: 15_000 });
    await expect(page.getByLabel("Role 1").getByLabel("Edit point")).toHaveCount(0);
    await expect(page.getByLabel("Project name")).toHaveCount(0);
    await expect(page.getByLabel("Link 2 address")).toHaveCount(0);
    await expect(page.getByLabel("Full name")).toHaveValue("Meera Iyer"); // untouched fields stay as they were
    await b.ctx.close();
  });

  test("signing out and back in on the same device keeps every field", async ({ page }) => {
    const email = unique();
    await fresh(page, "/profile");
    await signIn(page, email);
    await page.getByLabel("Full name").fill("Ravi Menon");
    await page.getByLabel("Phone").fill("+91 99999 88888");
    await settle(page);
    await syncNow(page);
    await page.getByRole("button", { name: /Account:/ }).click();
    await dialog(page).getByRole("button", { name: /^Sign out$/ }).click();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("Full name")).toHaveValue("Ravi Menon"); // still on this device
    await signIn(page, email);
    await expect(page.getByLabel("Full name")).toHaveValue("Ravi Menon");
    await expect(page.getByLabel("Phone")).toHaveValue("99999 88888");
    await expect(page.getByLabel("Country code")).toHaveValue("IN");
  });
});
