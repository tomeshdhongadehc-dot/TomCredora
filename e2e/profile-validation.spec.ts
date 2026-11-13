import { expect, test, type Page } from "@playwright/test";

async function fresh(page: Page) {
  await page.goto("/profile");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
}

test.describe("validation, messages and tooltips", () => {
  test("email: the message appears after leaving the box, marks it invalid, and goes when fixed", async ({ page }) => {
    await fresh(page);
    const email = page.getByLabel("Email");
    await expect(email).toHaveAttribute("title", /Employers will write to this address/); // tooltip
    await email.fill("asha");
    await expect(page.getByText("does not look like an email address")).toHaveCount(0); // not while still typing
    await email.blur();
    await expect(page.getByText("does not look like an email address")).toBeVisible();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAttribute("aria-describedby", /.+/);
    await email.fill("asha@example.com");
    await expect(page.getByText("does not look like an email address")).toHaveCount(0);
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
    await email.fill("");
    await email.blur();
    await expect(page.getByText("Enter your email address so employers can reach you.")).toBeVisible();
  });

  test("name and phone", async ({ page }) => {
    await fresh(page);
    await page.getByLabel("Full name").fill("Ravi 2");
    await page.getByLabel("Full name").blur();
    await expect(page.getByText("Use letters only in your name")).toBeVisible();
    await page.getByLabel("Full name").fill("Ravi Menon");
    await expect(page.getByText("Use letters only in your name")).toHaveCount(0);
    await page.getByLabel("Country code").selectOption("IN");
    await page.getByLabel("Phone").fill("98765 4321");
    await page.getByLabel("Phone").blur();
    await expect(page.getByText("An Indian mobile number has 10 digits")).toBeVisible();
    await page.getByLabel("Phone").fill("98765 43210");
    await expect(page.getByText("An Indian mobile number has 10 digits")).toHaveCount(0);
    await page.getByLabel("Country code").selectOption("GB");
    await page.getByLabel("Phone").fill("123");
    await page.getByLabel("Phone").blur();
    await expect(page.getByText("A phone number has 7 to 15 digits")).toBeVisible();
  });

  test("links: the address must be a real one for that site, and a name is needed", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "+ LinkedIn" }).click();
    const addr = page.getByLabel("Link 1 address");
    await expect(addr).toHaveAttribute("title", /full web address/);
    await addr.fill("https://example.com/asha");
    await addr.blur();
    await expect(page.getByText("does not look like a LinkedIn address")).toBeVisible();
    await expect(addr).toHaveAttribute("aria-invalid", "true");
    await addr.fill("linkedin.com/in/asha");
    await expect(page.getByText("starting with https://")).toBeVisible();
    await addr.fill("https://www.linkedin.com/in/asha");
    await expect(page.getByText("starting with https://")).toHaveCount(0);
    await expect(page.getByText("does not look like a LinkedIn address")).toHaveCount(0);
    await page.getByLabel("Link 1 name").fill("");
    await page.getByLabel("Link 1 name").blur();
    await expect(page.getByText("Give this link a name")).toBeVisible();
  });

  test("a role, school or project that is started shows what is still missing", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "+ Add a role" }).click();
    const role = page.getByLabel("Role 1");
    await role.getByLabel("Job title").fill("Developer");
    await expect(role.getByText("Enter the company or organisation.")).toBeVisible();
    await expect(role.getByText("Add the city this job was in.")).toBeVisible();
    await expect(role.getByText("Pick the month and year you started.")).toBeVisible();
    await expect(role.getByLabel("Company")).toHaveAttribute("aria-invalid", "true");
    await role.getByLabel("Company").fill("Initech");
    await expect(role.getByText("Enter the company or organisation.")).toHaveCount(0);
    await role.getByLabel("Start month").selectOption("Jan");
    await role.getByLabel("Start year").selectOption("2022");
    await expect(role.getByText("Pick the month and year you finished")).toBeVisible();
    await role.getByLabel("I work here now").check();
    await expect(role.getByText("Pick the month and year you finished")).toHaveCount(0);

    await page.getByRole("button", { name: "+ Add education" }).click();
    const edu = page.getByLabel("Education 1");
    await edu.getByLabel("School or college").fill("VTU");
    await expect(edu.getByText("Choose or type your degree.")).toBeVisible();
    await edu.getByLabel("Degree").fill("BCA");
    await expect(edu.getByText("Choose or type your degree.")).toHaveCount(0);

    await page.getByRole("button", { name: "+ Add a project" }).click();
    await page.getByLabel("Link (optional)").fill("not a link");
    await page.getByLabel("Link (optional)").blur();
    await expect(page.getByText("Enter the full address, starting with https://")).toBeVisible();
    await expect(page.getByText("Give this project a name.")).toBeVisible();
  });

  test("adding your own skill: too short and duplicates are explained", async ({ page }) => {
    await fresh(page);
    const box = page.getByRole("textbox", { name: /another .* skill/ }).first();
    const add = page.getByRole("button", { name: /^Add: another .* skill/ }).first();
    await box.fill("a");
    await add.click();
    await expect(page.getByText("Type at least 2 characters.")).toBeVisible();
    await box.fill("Kubernetes");
    await expect(page.getByText("Type at least 2 characters.")).toHaveCount(0); // clears as you type
    await add.click();
    await box.fill("kubernetes");
    await add.click();
    await expect(page.getByText("You already added that one.")).toBeVisible();
  });
});

test.describe("skill limit", () => {
  test("at 30 skills nothing more can be added, the summary says so, and removing one frees a place", async ({ page }) => {
    await page.goto("/profile");
    const many = Array.from({ length: 30 }, (_, i) => `Skill ${i + 1}`);
    await page.evaluate((items) => {
      localStorage.clear();
      localStorage.setItem("arb.profile.v1", JSON.stringify({ focus: "software", resume: { schemaVersion: 1, contact: { fullName: "", headline: "", email: "", phone: "", location: "", links: [] }, summary: "", skills: [{ label: "Languages", items: items.slice(0, 15) }, { label: "Tools", items: items.slice(15) }], experience: [], projects: [], education: [], certifications: [] } }));
    }, many);
    await page.reload();
    const summary = page.getByRole("region", { name: "Your selected skills" });
    await expect(summary).toContainText("(30 of 30)");
    await expect(summary.getByRole("status")).toContainText("most a resume should carry");
    const groups = page.getByRole("group", { name: /skills$/ });
    // every suggestion that is not chosen is switched off
    const buttons = groups.first().getByRole("button");
    const n = await buttons.count();
    let off = 0;
    for (let i = 0; i < n; i++) if (await buttons.nth(i).isDisabled()) off++;
    expect(off).toBeGreaterThan(0);
    await expect(page.getByRole("textbox", { name: /another .* skill/ }).first()).toBeDisabled();
    // taking one off makes room again
    await groups.nth(0).getByRole("button", { name: "Skill 1", exact: true }).click();
    await expect(summary).toContainText("(29 of 30)");
    await expect(summary.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /another .* skill/ }).first()).toBeEnabled();
  });
});

test.describe("city search knows the common names", () => {
  for (const [typed, expected] of [["bangalore", "Bengaluru"], ["bomb", "Mumbai"], ["gurg", "Gurugram"], ["trivan", "Thiruvananthapuram"], ["kiev", "Kyiv"]] as const) {
    test(`${typed} finds ${expected}`, async ({ page }) => {
      await fresh(page);
      await page.getByLabel("City, country").fill(typed);
      await expect(page.getByRole("listbox", { name: "Places" }).getByRole("option").first()).toContainText(expected);
    });
  }
});

test.describe("layout on phones of different widths", () => {
  for (const width of [320, 360, 412]) {
    test(`no sideways scrolling at ${width}px with every section open and a phone number entered`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await fresh(page);
      await page.getByLabel("Phone").fill("98765 43210");
      await page.getByRole("button", { name: "+ Add a role" }).click();
      await page.getByRole("button", { name: "+ Add education" }).click();
      await page.getByRole("button", { name: "+ Add a project" }).click();
      await page.getByRole("button", { name: "+ LinkedIn" }).click();
      await page.getByLabel("Link 1 address").fill("https://example.com/a-long-address-that-should-not-widen-the-page-at-all");
      await page.getByLabel("Email").fill("someone.with.a.very.long.address@a-long-company-name.example.com");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      // the code list and the number sit side by side
      const code = await page.getByLabel("Country code").boundingBox();
      const num = await page.getByLabel("Phone").boundingBox();
      expect(Math.abs(code!.y - num!.y)).toBeLessThan(6);
      expect(num!.x + num!.width).toBeLessThanOrEqual(width);
    });
  }
});
