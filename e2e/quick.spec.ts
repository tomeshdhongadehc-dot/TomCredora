import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFParse } from "pdf-parse";

const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker required.";
const ORIGINAL = "Rebuilt checkout in React and TypeScript, lifting conversion 14% across 2M monthly users";
const EMBELLISHED = "Spearheaded a high-performance checkout rebuild in React and TypeScript, lifting conversion 14% across 2M monthly users";

async function fresh(page: Page) {
  await page.goto("/quick");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByRole("heading", { name: "A tailored resume in under a minute" })).toBeVisible();
}

/** Mocked AI answer: keeps the profile, flags the first bullet as embellished. */
async function mockTailor(page: Page, seen: { count: number; body?: Record<string, unknown>; headers?: Record<string, string> } = { count: 0 }) {
  await page.route("**/api/v1/tailor", async (route) => {
    seen.count++;
    seen.headers = route.request().headers();
    const body = JSON.parse(route.request().postData() ?? "{}");
    seen.body = body;
    const exp = body.profile.experience[0];
    exp.bullets[0] = EMBELLISHED;
    await route.fulfill({
      json: {
        resume: body.profile, issues: [], questions: [],
        ledger: [{ roleId: exp.id, position: 0, text: EMBELLISHED, from: 0, original: ORIGINAL, needsMetric: false, status: "needs-confirmation", reasons: ['New wording not in your original: "spearheaded", "high-performance". Confirm it is true.'] }],
      },
    });
  });
  return seen;
}

const create = (page: Page) => page.getByRole("button", { name: /Create (my resume|again)|Creating/ });

test.describe("quick resume", () => {
  test("empty state: nothing to send until details, a job and a confirmation exist", async ({ page }) => {
    await fresh(page);
    await expect(page.getByText("No profile yet")).toBeVisible();
    await expect(create(page)).toBeDisabled();
    await expect(page.getByText("Create your profile first.")).toBeVisible();
  });

  test("saved details + job + confirmation -> a resume with exports, in one screen", async ({ page }) => {
    await fresh(page);
    const seen = await mockTailor(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await expect(page.getByLabel("Profile summary")).toContainText("Asha Rao");
    await expect(create(page)).toBeDisabled();
    await expect(page.getByText("Paste the job description (at least a few lines).")).toBeVisible();

    await page.getByLabel("Paste the job description").fill(JD);
    await expect(page.getByText("Confirm your details to continue.")).toBeVisible();
    await expect(create(page)).toBeDisabled();

    // the user sees exactly what is sent
    const facts = page.getByLabel("Details to send");
    await expect(facts).toContainText("Asha Rao");
    await expect(facts).toContainText("asha.rao@example.com");

    await page.getByLabel(/These details are accurate/).check();
    await expect(create(page)).toBeEnabled();
    await create(page).click();

    const result = page.getByLabel("Your resume", { exact: true });
    await expect(result).toBeVisible();
    await expect(result.locator("[data-resume-paper]")).toContainText(EMBELLISHED);
    await expect(result.getByText(/ready in \d+s/)).toBeVisible();
    // export buttons come with it
    await expect(page.getByRole("button", { name: /Download PDF/ })).toBeVisible();
    // the flagged bullet is open for confirmation, not hidden
    await expect(page.getByRole("region", { name: "Bullets to confirm" })).toContainText(`AI wrote: ${EMBELLISHED}`);

    // only the profile and the job description are sent, with an idempotency key
    expect(seen.count).toBe(1);
    expect(Object.keys(seen.body!).sort()).toEqual(["jd", "profile"]);
    // PRIVACY: the real contact details never leave the browser during tailoring (a placeholder is sent instead)...
    const sent = JSON.stringify(seen.body);
    for (const secret of ["Asha Rao", "asha.rao@example.com", "+91 90000 00000", "linkedin.com/in/asharao", "Bengaluru, India"]) expect(sent, `${secret} must not be sent`).not.toContain(secret);
    expect((seen.body as { profile: { contact: { fullName: string } } }).profile.contact.fullName).toBe("Candidate");
    // ...and they are back on the result shown to the user
    await expect(result.locator("[data-resume-paper]")).toContainText("Asha Rao");
    await expect(result.locator("[data-resume-paper]")).toContainText("asha.rao@example.com");
    expect(seen.headers!["idempotency-key"]).toMatch(/[0-9a-f-]{36}/);
    expect(seen.headers!["x-gemini-key"]).toBeUndefined();
  });

  test("the profile is never changed by generating, and editing it afterwards withdraws the confirmation", async ({ page }) => {
    await fresh(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Paste the job description").fill(JD);
    await page.getByLabel(/These details are accurate/).check();
    await page.waitForTimeout(700); // the profile autosaves
    const before = await page.evaluate(() => localStorage.getItem("arb.profile.v1"));
    expect(before).toContain("Asha Rao");
    await create(page).click();
    await expect(page.getByLabel("Your resume", { exact: true })).toBeVisible();
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => localStorage.getItem("arb.profile.v1"))).toBe(before);
    // the AI's wording went into the resume, not into the profile
    expect(await page.evaluate(() => localStorage.getItem("arb.profile.v1"))).not.toContain("Spearheaded");

    // change one detail on the profile page: the confirmation has to be given again
    await page.getByRole("link", { name: "Edit profile" }).click();
    await page.getByLabel("Full name").fill("Asha R. Rao");
    await page.waitForTimeout(700);
    await page.goto("/quick");
    await expect(page.getByLabel("Details to send")).toContainText("Asha R. Rao");
    await expect(page.getByLabel(/These details are accurate/)).not.toBeChecked();
    await expect(create(page)).toBeDisabled();
  });

  test("a person with a resume but no profile can adopt it as their profile in one tap", async ({ page }) => {
    await page.goto("/studio");
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.getByRole("button", { name: "Load example" }).click();
    await page.waitForTimeout(700);
    await page.goto("/quick");
    await page.getByRole("button", { name: /Use my current resume/ }).click();
    await expect(page.getByLabel("Profile summary")).toContainText("Asha Rao");
  });

  test("template: Classic by default, any other can be picked, and it applies to the result", async ({ page }) => {
    await fresh(page);
    await mockTailor(page);
    const select = page.getByLabel("Template", { exact: true });
    await expect(select).toHaveValue("classic");
    await select.selectOption("scholar");
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Paste the job description").fill(JD);
    await page.getByLabel(/These details are accurate/).check();
    await create(page).click();
    await expect(page.getByLabel("Your resume", { exact: true }).locator("header.rp-head3")).toBeVisible();
  });

  test("an AI error is explained and nothing is lost", async ({ page }) => {
    await fresh(page);
    await page.route("**/api/v1/tailor", (route) => route.fulfill({ status: 503, headers: { "retry-after": "60" }, json: { error: { code: "quota", message: "The free AI quota is used up for now. Try again later or use your own key." } } }));
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Paste the job description").fill(JD);
    await page.getByLabel(/These details are accurate/).check();
    await create(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "quota" })).toBeVisible();
    await expect(page.getByLabel("Profile summary")).toContainText("Asha Rao");
    await expect(create(page)).toBeEnabled();
  });

  test("a result survives a reload (saved with the resume)", async ({ page }) => {
    await fresh(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Paste the job description").fill(JD);
    await page.getByLabel(/These details are accurate/).check();
    await create(page).click();
    await expect(page.getByLabel("Your resume", { exact: true })).toBeVisible();
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.getByLabel("Your resume", { exact: true }).locator("[data-resume-paper]")).toContainText(EMBELLISHED);
  });

  test("the printed PDF is the resume only, one page of text", async ({ page }) => {
    await fresh(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Paste the job description").fill(JD);
    await page.getByLabel(/These details are accurate/).check();
    await create(page).click();
    await expect(page.getByLabel("Your resume", { exact: true })).toBeVisible();
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const p = new PDFParse({ data: pdf });
    const { text, total } = await p.getText();
    await p.destroy();
    expect(total).toBe(1);
    expect(text).toContain("Asha Rao");
    expect(text).toContain("Acme Corp");
    for (const ui of ["Create my resume", "Confirm and create", "Quick resume", "Edit details", "Download PDF"]) expect(text).not.toContain(ui);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`passes the axe scan, empty and with a result (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await fresh(page);
      await mockTailor(page);
      const settle = () => page.evaluate(() => Promise.all(document.getAnimations().filter((x) => x.effect?.getComputedTiming().iterations !== Infinity).map((x) => x.finished.catch(() => undefined))));
      const scan = async (label: string) => {
        await settle();
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();
        expect(r.violations.map((v) => `${label}: ${v.id} ${v.nodes[0]?.target}`), label).toEqual([]);
      };
      await scan("empty");
      await page.getByRole("button", { name: "Load example profile" }).click();
      await page.getByLabel("Paste the job description").fill(JD);
      await page.getByLabel(/These details are accurate/).check();
      await create(page).click();
      await expect(page.getByLabel("Your resume", { exact: true })).toBeVisible();
      await scan("result");
    });
  }
});

const JD_GAPS = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker and Kubernetes required.";
const inProfile = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("arb.profile.v1") ?? "null"));
const skillsOf = (p: { resume: { skills: { items: string[] }[] } }) => p.resume.skills.flatMap((g) => g.items);

test.describe("skills the job asks for", () => {
  test("the job's skills are compared with the profile; missing ones are offered, never added", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await expect(page.getByRole("region", { name: "Skills this job asks for" })).toHaveCount(0); // nothing until a job is pasted
    await page.getByLabel("Paste the job description").fill(JD_GAPS);
    const panel = page.getByRole("region", { name: "Skills this job asks for" });
    await expect(panel).toBeVisible();
    // what the user has goes first, automatically
    const have = panel.getByLabel("Skills you have that this job wants");
    for (const s of ["React", "TypeScript", "Next.js", "AWS", "Docker"]) await expect(have).toContainText(s);
    // what they lack is a choice, not an addition
    const lack = panel.getByRole("group", { name: "Skills in this job that are not in your profile" });
    await expect(lack.getByRole("button", { name: "+ GraphQL (I have this)" })).toHaveAttribute("aria-pressed", "false");
    await expect(lack.getByRole("button", { name: "+ Kubernetes (I have this)" })).toBeVisible();
    await page.waitForTimeout(700);
    expect(skillsOf(await inProfile(page))).not.toContain("GraphQL");
    expect(skillsOf(await inProfile(page))).not.toContain("Kubernetes");
  });

  test("only the skills the user taps reach the AI and the resume; a mis-tap can be undone", async ({ page }) => {
    await fresh(page);
    const seen = await mockTailor(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Paste the job description").fill(JD_GAPS);
    const lack = page.getByRole("group", { name: "Skills in this job that are not in your profile" });

    await lack.getByRole("button", { name: "+ Kubernetes (I have this)" }).click();
    await lack.getByRole("button", { name: /Kubernetes/ }).click(); // un-tap: it was a mistake
    await lack.getByRole("button", { name: "+ GraphQL (I have this)" }).click();
    await expect(lack.getByRole("button", { name: /GraphQL/ })).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(700);
    const saved = skillsOf(await inProfile(page));
    expect(saved).toContain("GraphQL");
    expect(saved).not.toContain("Kubernetes");

    await page.getByLabel(/These details are accurate/).check();
    await create(page).click();
    const result = page.getByLabel("Your resume", { exact: true });
    await expect(result).toBeVisible();
    expect(skillsOf({ resume: (seen.body as { profile: never }).profile })).toContain("GraphQL"); // the AI was told about it
    expect(skillsOf({ resume: (seen.body as { profile: never }).profile })).not.toContain("Kubernetes");
    await expect(result.locator("[data-resume-paper]")).toContainText("GraphQL");
    await expect(result.locator("[data-resume-paper]")).not.toContainText("Kubernetes");
  });

  test("tapping a skill changes the details, so the confirmation has to be given again", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Paste the job description").fill(JD_GAPS);
    await page.getByLabel(/These details are accurate/).check();
    await expect(create(page)).toBeEnabled();
    await page.getByRole("button", { name: "+ GraphQL (I have this)" }).click();
    await expect(page.getByLabel(/These details are accurate/)).not.toBeChecked();
    await expect(create(page)).toBeDisabled();
  });

  test("a skill of your own from the job can be typed in, and Enter adds it", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Paste the job description").fill(JD_GAPS);
    const box = page.getByRole("textbox", { name: "Another skill from this job that you have" });
    await box.fill("Kafka");
    await box.press("Enter");
    await expect(page.getByRole("button", { name: /Kafka/ })).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(700);
    expect(skillsOf(await inProfile(page))).toContain("Kafka");
  });

  test("the result lists the user's matching skills first, in the job's order of importance, with nothing added", async ({ page }) => {
    await fresh(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Paste the job description").fill(JD_GAPS);
    await page.getByLabel(/These details are accurate/).check();
    await create(page).click();
    const paper = page.getByLabel("Your resume", { exact: true }).locator("[data-resume-paper]");
    // the example's Tools line is "Git, Docker, AWS, CI/CD": the two the job wants come first
    await expect(paper).toContainText("Tools: Docker, AWS, Git, CI/CD");
    await expect(paper).not.toContainText("Kubernetes");
    await expect(paper).not.toContainText("GraphQL");
  });

  test("after generating, a missing keyword that is true can be added with one tap", async ({ page }) => {
    await fresh(page);
    await mockTailor(page);
    await page.getByRole("button", { name: "Load example profile" }).click();
    await page.getByLabel("Paste the job description").fill(JD_GAPS);
    await page.getByLabel(/These details are accurate/).check();
    await create(page).click();
    const paper = page.getByLabel("Your resume", { exact: true }).locator("[data-resume-paper]");
    await expect(paper).not.toContainText("GraphQL");
    await page.getByRole("button", { name: "Add GraphQL to my skills (I have this)" }).click();
    await expect(paper).toContainText("GraphQL");
  });
});
