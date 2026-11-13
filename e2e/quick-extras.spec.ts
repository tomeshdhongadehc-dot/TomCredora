import AxeBuilder from "@axe-core/playwright";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_RESUME } from "../src/lib/sample";

const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker required. Mentor juniors.";
const JD2 = "Data Analyst who builds Power BI dashboards and writes SQL. Python for automation. Talk to stakeholders every week.";

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const create = (page: Page) => page.getByRole("button", { name: /Create (my resume|again)|Creating/ });

async function fresh(page: Page, path = "/quick") {
  await page.goto(path);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
}

/** Mocked tailoring: returns the profile as it is (so the result is predictable). */
async function mockTailor(page: Page) {
  await page.route("**/api/v1/tailor", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({ json: { resume: body.profile, issues: [], questions: [], ledger: [] } });
  });
}

async function makeResume(page: Page, jd = JD) {
  await page.getByLabel("Paste the job description").fill(jd);
  await page.getByLabel(/These details are accurate/).check();
  await create(page).click();
  await expect(page.getByLabel("Your resume", { exact: true })).toBeVisible({ timeout: 20_000 });
}

/** A profile long enough to run past one page. */
const longProfile = () => {
  const r = structuredClone(SAMPLE_RESUME);
  const filler = (n: number, tag: string) => Array.from({ length: 7 }, (_, i) => `${tag} ${n}.${i}: coordinated delivery of an internal platform with several partner teams across the quarter and documented the outcome for the wider group`);
  r.experience = [0, 1, 2, 3].map((n) => ({ id: `e${n}`, company: `Company ${n}`, role: `Engineer ${n}`, location: "", start: `Jan 20${10 + n}`, end: n === 0 ? "Present" : `Dec 20${11 + n}`, bullets: filler(n, "Led") }));
  return JSON.stringify({ focus: "software", resume: r });
};

test.describe("importing a resume you already have", () => {
  const TEXT = `Asha Rao
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
Tools: Git, Docker

LANGUAGES
English, Hindi`;

  test("pasting text shows what was found, then fills the profile", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "Import my resume" }).click();
    await page.getByLabel("Or paste the text of your resume").fill(TEXT);
    await page.getByRole("button", { name: "Read my resume" }).click();
    const found = page.getByLabel("Imported details");
    await expect(found).toContainText("Asha Rao");
    await expect(found).toContainText("asha.rao@example.com");
    await expect(found.getByLabel("Found in the resume")).toContainText("2 jobs");
    await expect(found.getByLabel("Found in the resume")).toContainText("Senior Frontend Engineer at Acme Corp");
    await expect(found.getByRole("note", { name: "Things to check" })).toContainText(/languages/i);
    await found.getByRole("button", { name: "Use this as my profile" }).click();
    await expect(page.getByLabel("Profile summary")).toContainText("Asha Rao");
    await expect(page.getByLabel("Profile summary")).toContainText("2 roles");
    await expect(page.getByText(/Imported\. Check the details in/)).toBeVisible();
    // the profile page has the same data to correct
    await page.goto("/profile");
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");
    await expect(page.getByLabel("Email")).toHaveValue("asha.rao@example.com");
  });

  test("pasted text never leaves the browser", async ({ page }) => {
    await fresh(page);
    const calls: string[] = [];
    page.on("request", (r) => /\/api\//.test(r.url()) && calls.push(r.url()));
    await page.getByRole("button", { name: "Import my resume" }).click();
    await page.getByLabel("Or paste the text of your resume").fill(TEXT);
    await page.getByRole("button", { name: "Read my resume" }).click();
    await expect(page.getByLabel("Imported details")).toBeVisible();
    expect(calls.filter((u) => /import-file|tailor|bullet|cover/.test(u))).toEqual([]);
  });

  test("a real PDF is read, and so is a real Word file", async ({ page, browser }) => {
    await fresh(page);
    // a PDF made by the browser's own print engine, like one saved from a word processor
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.setContent(`<body style="font:12pt Arial">${TEXT.split("\n").map((l) => `<div>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;") || "&nbsp;"}</div>`).join("")}</body>`);
    const pdf = await p.pdf({ format: "A4" });
    await ctx.close();
    await page.getByRole("button", { name: "Import my resume" }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "my cv.pdf", mimeType: "application/pdf", buffer: pdf });
    const found = page.getByLabel("Imported details");
    await expect(found).toContainText("Asha Rao", { timeout: 20_000 });
    await expect(found.getByLabel("Found in the resume")).toContainText("2 jobs");
    await found.getByRole("button", { name: "Start again" }).click();

    const docx = await Packer.toBuffer(new Document({ sections: [{ children: TEXT.split("\n").map((t) => new Paragraph({ children: [new TextRun(t)] })) }] }));
    await page.locator('input[type="file"]').setInputFiles({ name: "cv.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docx });
    await expect(found).toContainText("Asha Rao", { timeout: 20_000 });
    await expect(found.getByLabel("Found in the resume")).toContainText("2 jobs");
  });

  test("files that cannot be read get a plain message, and nothing is changed", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "Import my resume" }).click();
    const file = page.locator('input[type="file"]');
    const alert = page.getByRole("main").getByRole("alert");
    await file.setInputFiles({ name: "old.doc", mimeType: "application/msword", buffer: Buffer.from("x") });
    await expect(alert).toContainText("Save it as .docx or PDF");
    await file.setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("this is not really a pdf, only words") });
    await expect(alert).toContainText(/does not look like a PDF/);
    await file.setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("x") });
    await expect(alert).toContainText("PDF or Word");
    await file.setInputFiles({ name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(5 * 1024 * 1024) });
    await expect(alert).toContainText("too large");
    await page.getByLabel("Or paste the text of your resume").fill("just some words that are not a resume at all, nothing to find here really");
    await page.getByRole("button", { name: "Read my resume" }).click();
    await expect(alert).toContainText("could not find a resume");
    await expect(page.getByText("No profile yet")).toBeVisible();
  });

  test("when a profile exists the person is told it will be replaced, and can back out", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByRole("button", { name: "Import a resume" }).click();
    await page.getByLabel("Or paste the text of your resume").fill(TEXT.replace("Asha Rao", "Priya Nair"));
    await page.getByRole("button", { name: "Read my resume" }).click();
    await expect(page.getByLabel("Imported details")).toContainText("This replaces the details already in your profile");
    await page.getByRole("button", { name: "Start again" }).click();
    await expect(page.getByLabel("Profile summary")).toContainText("Asha Rao");
    await page.getByLabel("Or paste the text of your resume").fill(TEXT.replace("Asha Rao", "Priya Nair"));
    await page.getByRole("button", { name: "Read my resume" }).click();
    await page.getByRole("button", { name: "Replace my profile with this" }).click();
    await expect(page.getByLabel("Profile summary")).toContainText("Priya Nair");
  });

  test("the profile page has the importer too", async ({ page }) => {
    await fresh(page, "/profile");
    await page.getByRole("button", { name: "Import my resume" }).click();
    await page.getByLabel("Or paste the text of your resume").fill(TEXT);
    await page.getByRole("button", { name: "Read my resume" }).click();
    await page.getByRole("button", { name: "Use this as my profile" }).click();
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Rao");
    await expect(page.getByText(/Imported\. Check each section/)).toBeVisible();
  });
});

test.describe("reading a job from a link", () => {
  const LINK = "https://jobs.example-company.com/careers/frontend-engineer";
  test("fills in the job description, title and company, and says where it came from", async ({ page }) => {
    await fresh(page);
    let sent = "";
    await page.route("**/api/v1/job-url", async (route) => {
      sent = route.request().postData() ?? "";
      await route.fulfill({ json: { text: JD, title: "Senior Frontend Engineer", company: "Acme Corp", host: "jobs.example-company.com", via: "structured", truncated: false } });
    });
    await page.getByLabel("Or paste a link to the job").fill(LINK);
    await page.getByRole("button", { name: "Read the job" }).click();
    await expect(page.getByLabel("Paste the job description")).toHaveValue(JD);
    await expect(page.getByLabel("Job title (optional)")).toHaveValue("Senior Frontend Engineer");
    await expect(page.getByLabel("Company (optional)")).toHaveValue("Acme Corp");
    await expect(page.getByText("Read the job from jobs.example-company.com")).toBeVisible();
    expect(JSON.parse(sent)).toEqual({ url: LINK });
  });

  test("a page we cannot read says so and keeps what was typed", async ({ page }) => {
    await fresh(page);
    await page.route("**/api/v1/job-url", (route) => route.fulfill({ status: 422, json: { error: { code: "link_unreadable", message: "That page did not give us the job text. Many job sites need you to be signed in. Please copy the job description and paste it instead." } } }));
    await page.getByLabel("Paste the job description").fill("My own notes about the job, long enough to keep around");
    await page.getByLabel("Or paste a link to the job").fill(LINK);
    await page.getByRole("button", { name: "Read the job" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("paste it instead");
    await expect(page.getByLabel("Paste the job description")).toHaveValue("My own notes about the job, long enough to keep around");
  });

  test("a mistyped address is caught before anything is sent; the offline case is explained", async ({ page, context }) => {
    await fresh(page);
    let calls = 0;
    await page.route("**/api/v1/job-url", async (route) => { calls++; await route.abort(); });
    await page.getByLabel("Or paste a link to the job").fill("example.com/jobs/1 is the link");
    await page.getByRole("button", { name: "Read the job" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("starting with https://");
    expect(calls).toBe(0);
    await page.getByLabel("Or paste a link to the job").fill(LINK);
    await page.getByRole("button", { name: "Read the job" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Network problem");
    void context;
  });

  test("the real route refuses addresses inside a network, with no AI involved", async ({ request }) => {
    for (const url of ["https://169.254.169.254/latest/meta-data/", "https://localhost/admin", "http://example.com/", "https://127.0.0.1/"]) {
      const res = await request.post("/api/v1/job-url", { data: { url } });
      expect(res.status(), url).toBe(400);
    }
  });
});

test.describe("fitting to a page", () => {
  test("says how long it is, fits it, shows what was removed, and can undo", async ({ page }) => {
    await page.goto("/quick");
    await page.evaluate((p) => { localStorage.clear(); localStorage.setItem("arb.profile.v1", p); }, longProfile());
    await page.reload();
    await mockTailor(page);
    await makeResume(page);
    const fit = page.getByLabel("Page fit");
    await expect(fit).toContainText(/\d pages\./, { timeout: 10_000 });
    await expect(fit).toContainText(/line.* over one page/);
    const before = await page.locator("[data-resume-paper]").first().innerText();
    await fit.getByRole("button", { name: "Fit to 1 page" }).click();
    await expect(fit).toContainText(/Now one page\.|Still \d pages/, { timeout: 15_000 });
    await expect(fit).toContainText("Now one page.");
    await expect(fit.getByLabel("What changed")).toContainText(/Removed \d+ point/);
    const after = await page.locator("[data-resume-paper]").first().innerText();
    expect(after.length).toBeLessThan(before.length);
    // the points that were kept still belong to the person: nothing new was written
    for (const line of after.split("\n").filter((l) => l.startsWith("Led "))) expect(before).toContain(line);
    await fit.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => resultText(page)).toBe(before);
    await expect(fit).toContainText(/\d pages\./);
  });

  test("a resume that already fits just says so", async ({ page }) => {
    await fresh(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await makeResume(page);
    await expect(page.getByLabel("Page fit")).toContainText("1 page.");
    await expect(page.getByLabel("Page fit").getByRole("button")).toHaveCount(0);
  });
});

function resultText(page: Page) { return page.locator("[data-resume-paper]").first().innerText(); }

test.describe("polishing one point", () => {
  async function ready(page: Page) {
    await fresh(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await makeResume(page);
  }
  const first = (page: Page) => page.getByRole("list").filter({ has: page.getByRole("button", { name: /^Make shorter/ }) }).first().getByRole("listitem").first();

  test("shorter: shows a suggestion, flags new words, and changes nothing until chosen", async ({ page }) => {
    await ready(page);
    let sent: Record<string, unknown> = {};
    await page.route("**/api/v1/bullet", async (route) => {
      sent = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({ json: { text: "Rebuilt checkout in React and TypeScript, lifting conversion 14%", novel: ["scalable"] } });
    });
    const before = await resultText(page);
    const item = first(page);
    await item.getByRole("button", { name: /^Make shorter/ }).click();
    const sug = item.getByRole("group", { name: "Suggested wording" });
    await expect(sug).toContainText("Rebuilt checkout in React and TypeScript, lifting conversion 14%");
    await expect(sug.getByRole("note")).toContainText('"scalable"');
    expect(sent.mode).toBe("shorten");
    expect(JSON.stringify(sent)).not.toContain("asha.rao@example.com"); // contact details never go
    expect(await resultText(page)).toBe(before);
    await sug.getByRole("button", { name: "Keep mine" }).click();
    expect(await resultText(page)).toBe(before);
    await item.getByRole("button", { name: /^Make shorter/ }).click();
    await item.getByRole("button", { name: "Use this" }).click();
    expect(await resultText(page)).toContain("Rebuilt checkout in React and TypeScript, lifting conversion 14%");
    expect(await resultText(page)).not.toContain("across 2M monthly users");
  });

  test("keyword: only skills you have are offered, and the chosen one is sent", async ({ page }) => {
    await ready(page);
    let sent: Record<string, unknown> = {};
    await page.route("**/api/v1/bullet", async (route) => {
      sent = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({ json: { text: "Led a React and TypeScript checkout rebuild, lifting conversion 14%", novel: [] } });
    });
    const item = first(page);
    await item.getByRole("button", { name: /^Add a keyword/ }).click();
    const chips = item.getByRole("group", { name: "Keywords you can add" });
    await expect(chips).toBeVisible();
    await expect(chips.getByRole("button", { name: "Kubernetes" })).toHaveCount(0); // not in the profile, so never offered
    const names = await chips.getByRole("button").allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    await chips.getByRole("button").first().click();
    await expect(item.getByRole("group", { name: "Suggested wording" })).toBeVisible();
    expect(sent.mode).toBe("keyword");
    expect(sent.keyword).toBe(names[0]);
  });

  test("a failed request says why and leaves the point alone", async ({ page }) => {
    await ready(page);
    await page.route("**/api/v1/bullet", (route) => route.fulfill({ status: 503, json: { error: { code: "ai_quota_exhausted", message: "Today's free AI quota is used up. Try again tomorrow, or add your own free Gemini key to keep going." } } }));
    const before = await resultText(page);
    const item = first(page);
    await item.getByRole("button", { name: /^Stronger opening verb/ }).click();
    await expect(item.getByRole("alert")).toContainText("quota is used up");
    expect(await resultText(page)).toBe(before);
    await expect(item.getByRole("button", { name: /^Stronger opening verb/ })).toBeEnabled();
  });

  test("editing by hand works without the AI", async ({ page }) => {
    await ready(page);
    const item = first(page);
    await item.getByRole("button", { name: /^Edit by hand/ }).click();
    await item.getByLabel("Edit this point").fill("Rebuilt checkout end to end in React");
    await item.getByRole("button", { name: "Save" }).click();
    expect(await resultText(page)).toContain("Rebuilt checkout end to end in React");
  });
});

test.describe("the cover letter", () => {
  const PARAS = ["I build React and TypeScript applications and the role you describe is close to my daily work.", "At Acme Corp I rebuilt checkout in React and TypeScript and mentored other engineers along the way.", "I would welcome a conversation about the role."];
  async function ready(page: Page) {
    await fresh(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Company (optional)").fill("Acme Corp");
    await makeResume(page);
  }

  test("is written without contact details, then gets the real name and contact, and can be saved", async ({ page }) => {
    await ready(page);
    let sent: Record<string, any> = {};
    await page.route("**/api/v1/cover-letter", async (route) => {
      sent = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({ json: { paragraphs: PARAS, warnings: ['The number "73%" is not in your profile.'] } });
    });
    await page.getByRole("radio", { name: /Warm/ }).check();
    await page.getByRole("button", { name: "Write my cover letter" }).click();
    const box = page.getByLabel("Your letter (you can edit it)");
    await expect(box).toHaveValue(/Dear Acme Corp hiring team,/);
    const letter = await box.inputValue();
    expect(letter).toContain("Asha Rao");
    expect(letter).toContain("asha.rao@example.com");
    expect(letter).toContain("Sincerely,\nAsha Rao");
    expect(letter).toContain(PARAS[1]);
    // what the AI was sent
    expect(sent.tone).toBe("warm");
    expect(sent.company).toBe("Acme Corp");
    expect(sent.profile.contact).toMatchObject({ fullName: "Candidate", email: "candidate@example.com" });
    expect(JSON.stringify(sent)).not.toContain("asha.rao@example.com");
    expect(JSON.stringify(sent)).not.toContain("Asha Rao");
    await expect(page.getByRole("note", { name: "Facts to check" })).toContainText("73%");
    // editable, and the edit is what gets saved
    await box.fill(letter.replace("Dear Acme Corp hiring team,", "Dear Priya,"));
    const [txt] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .txt" }).click()]);
    expect(txt.suggestedFilename()).toMatch(/Asha_Rao.*Cover_letter\.txt$/);
    expect((await import("node:fs")).readFileSync(await txt.path(), "utf8")).toContain("Dear Priya,");
    const [docx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download Word (.docx)" }).click()]);
    expect(docx.suggestedFilename()).toMatch(/\.docx$/);
    expect((await import("node:fs")).readFileSync(await docx.path()).subarray(0, 2).toString()).toBe("PK");
    // it is still there after a reload
    await page.reload();
    await expect(page.getByLabel("Your letter (you can edit it)")).toHaveValue(/Dear Priya,/);
  });

  test("a failure is explained and keeps the page usable", async ({ page }) => {
    await ready(page);
    await page.route("**/api/v1/cover-letter", (route) => route.fulfill({ status: 502, json: { error: { code: "ai_bad_output", message: "The AI returned an unusable answer. Please retry." } } }));
    await page.getByRole("button", { name: "Write my cover letter" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("unusable answer");
    await expect(page.getByRole("button", { name: "Write my cover letter" })).toBeEnabled();
  });
});

test.describe("one resume per job, tracked", () => {
  test("a resume is saved for each job, a repeat keeps the earlier version, and the Applications page tracks them", async ({ page }) => {
    await fresh(page);
    await page.route("**/api/v1/tailor", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({ json: { resume: { ...body.profile, summary: `Made for: ${body.jd.slice(0, 20)} @${Date.now()}` }, issues: [], questions: [], ledger: [] } });
    });
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Job title (optional)").fill("Senior Frontend Engineer");
    await page.getByLabel("Company (optional)").fill("Acme Corp");
    await makeResume(page, JD);
    const saved = page.getByLabel("Saved application");
    await expect(saved).toContainText("Senior Frontend Engineer at Acme Corp");
    await expect(saved).toContainText("Saved");

    // the same job again keeps the earlier version
    await page.getByLabel("Paste the job description").fill(JD + " ");
    await create(page).click();
    await expect(page.getByRole("list", { name: "Earlier versions" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("list", { name: "Earlier versions" }).getByRole("listitem")).toHaveCount(1);

    // a different job becomes its own resume and the earlier one stays
    await page.getByLabel("Job title (optional)").fill("Data Analyst");
    await page.getByLabel("Company (optional)").fill("Initech");
    await page.getByLabel("Paste the job description").fill(JD2);
    await expect(page.getByText("This is a different job from the resume below.")).toBeVisible();
    await page.getByLabel(/These details are accurate/).check();
    await create(page).click();
    await expect(page.getByLabel("Saved application")).toContainText("Data Analyst at Initech", { timeout: 20_000 });

    await page.getByRole("link", { name: "See all applications" }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    const list = page.getByRole("list", { name: "Applications" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list).toContainText("Senior Frontend Engineer");
    await expect(list).toContainText("Data Analyst");

    // moving an application along, and a note, survive a reload
    const row = list.getByRole("listitem").filter({ hasText: "Data Analyst" });
    await row.getByLabel("Stage").selectOption("interview");
    await row.getByLabel("Notes").fill("Call Priya on Monday");
    await row.getByLabel("Notes").blur();
    await page.reload();
    const row2 = page.getByRole("list", { name: "Applications" }).getByRole("listitem").filter({ hasText: "Data Analyst" });
    await expect(row2.getByLabel("Stage")).toHaveValue("interview");
    await expect(row2.getByLabel("Notes")).toHaveValue("Call Priya on Monday");
    await page.getByRole("group", { name: "Show applications by stage" }).getByRole("button", { name: /^Interview/ }).click();
    await expect(page.getByRole("list", { name: "Applications" }).getByRole("listitem")).toHaveCount(1);
    await page.getByRole("group", { name: "Show applications by stage" }).getByRole("button", { name: /^All/ }).click();

    // open the exact resume in the workspace
    await page.getByRole("list", { name: "Applications" }).getByRole("listitem").filter({ hasText: "Senior Frontend Engineer" }).getByRole("button", { name: "Open this resume" }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole("button", { name: /^My resumes. Current: Senior Frontend Engineer at Acme Corp/ })).toBeVisible();
  });

  test("delete asks first; stop tracking keeps the resume; an empty page explains itself", async ({ page }) => {
    await fresh(page, "/jobs");
    await expect(page.getByText("Nothing here yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Make a resume for a job" })).toBeVisible();
    await page.goto("/quick");
    await mockTailor(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await makeResume(page);
    await page.getByRole("button", { name: "Start another job" }).click();
    await page.getByLabel("Paste the job description").fill(JD2);
    await page.getByLabel(/These details are accurate/).check();
    await create(page).click();
    await expect(page.getByLabel("Saved application")).toBeVisible({ timeout: 20_000 });
    await page.goto("/jobs");
    const items = page.getByRole("list", { name: "Applications" }).getByRole("listitem");
    await expect(items).toHaveCount(2);
    await items.first().getByRole("button", { name: /^Delete/ }).click();
    await expect(items).toHaveCount(2); // nothing is deleted by one click
    await page.getByRole("button", { name: "Keep it" }).click();
    await items.first().getByRole("button", { name: /^Delete/ }).click();
    await page.getByRole("button", { name: "Yes, delete the resume" }).click();
    await expect(items).toHaveCount(1);
    await items.first().getByRole("button", { name: /^Stop tracking/ }).click();
    await expect(page.getByText("Nothing here yet")).toBeVisible();
    await page.goto("/studio");
    await expect(page.getByRole("button", { name: /^My resumes/ })).toBeVisible(); // the resume itself is still there
  });
});

test.describe("on a small screen", () => {
  test("nothing scrolls sideways at 320px through the whole flow, and the new buttons are big enough to tap", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/quick");
    await page.evaluate((p) => { localStorage.clear(); localStorage.setItem("arb.profile.v1", p); }, longProfile());
    await page.reload();
    await mockTailor(page);
    await page.route("**/api/v1/cover-letter", (route) => route.fulfill({ json: { paragraphs: ["A".repeat(200) + " " + "wordwithoutanybreaksatalllllllllllllllllllllllllll".repeat(2), "Second paragraph of the letter that is long enough to count.", "Third paragraph of the letter that is long enough to count."], warnings: ["The number \"73%\" is not in your profile."] } }));
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Import a resume" }).click();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    for (const b of [page.getByRole("button", { name: "Choose a file" }), page.getByRole("button", { name: "Read my resume" })]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "Import a resume" }).click();
    expect((await page.getByRole("button", { name: "Read the job" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await makeResume(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const fit = page.getByLabel("Page fit");
    await expect(fit.getByRole("button", { name: "Fit to 1 page" })).toBeVisible({ timeout: 10_000 });
    expect((await fit.getByRole("button", { name: "Fit to 1 page" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await fit.getByRole("button", { name: "Fit to 1 page" }).click();
    await expect(fit).toContainText("Now one page.", { timeout: 15_000 });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Write my cover letter" }).click();
    await expect(page.getByLabel("Your letter (you can edit it)")).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    for (const name of [/^Make shorter/, /^Stronger opening verb/, /^Add a keyword/, /^Edit by hand/]) {
      const b = page.getByRole("button", { name }).first();
      await b.scrollIntoViewIfNeeded();
      expect((await b.boundingBox())!.height, String(name)).toBeGreaterThanOrEqual(44);
    }
    await page.goto("/jobs");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const row = page.getByRole("list", { name: "Applications" }).getByRole("listitem").first();
    for (const b of await row.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await row.getByLabel("Stage").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`the new screens pass the accessibility scan in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/quick");
    await page.evaluate((p) => { localStorage.clear(); localStorage.setItem("arb.profile.v1", p); }, longProfile());
    await page.reload();
    await mockTailor(page);
    await page.route("**/api/v1/job-url", (route) => route.fulfill({ status: 422, json: { error: { code: "link_unreadable", message: "That page did not give us the job text." } } }));
    await page.route("**/api/v1/cover-letter", (route) => route.fulfill({ json: { paragraphs: ["First paragraph of the letter that is long enough to count here.", "Second paragraph of the letter that is long enough to count.", "Third paragraph of the letter that is long enough to count."], warnings: ["The number \"73%\" is not in your profile."] } }));
    const scan = async (label: string) => expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target + " " + (n.any[0]?.message ?? "")).slice(0, 2).join(" ; ")}`)).toEqual([]);
    await page.getByRole("button", { name: "Import a resume" }).click();
    await scan("import panel");
    await page.getByLabel("Or paste the text of your resume").fill("Asha Rao\nasha@example.com\nEXPERIENCE\nEngineer\nAcme   Jan 2020 - Present\n- built things for the company every day\nSKILLS\nReact, TypeScript");
    await page.getByRole("button", { name: "Read my resume" }).click();
    await scan("import review");
    await page.getByRole("button", { name: "Start again" }).click();
    await page.getByRole("button", { name: "Import a resume" }).click();
    await page.getByLabel("Or paste a link to the job").fill("https://jobs.example-company.com/x1");
    await page.getByRole("button", { name: "Read the job" }).click();
    await expect(page.getByRole("main").getByRole("alert").first()).toBeVisible();
    await scan("job link error");
    await makeResume(page);
    await expect(page.getByLabel("Page fit")).toContainText(/pages\./, { timeout: 10_000 });
    await scan("result");
    await page.getByLabel("Page fit").getByRole("button", { name: "Fit to 1 page" }).click();
    await expect(page.getByLabel("Page fit")).toContainText("Now one page.", { timeout: 15_000 });
    await scan("after fitting");
    await page.getByRole("button", { name: "Write my cover letter" }).click();
    await expect(page.getByRole("note", { name: "Facts to check" })).toBeVisible();
    await scan("cover letter");
    await page.goto("/jobs");
    await expect(page.getByRole("list", { name: "Applications" })).toBeVisible();
    await scan("applications");
  });
}
