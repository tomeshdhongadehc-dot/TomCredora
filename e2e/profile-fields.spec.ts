import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("arb.profile.v1") ?? "{}"));
const settle = (page: Page) => page.waitForTimeout(700);

async function fresh(page: Page) {
  await page.goto("/profile");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
}

test.describe("About you", () => {
  test("your title comes first, then the name", async ({ page }) => {
    await fresh(page);
    const about = page.locator("section", { has: page.getByRole("heading", { name: "About you" }) });
    const labels = await about.locator("label").allInnerTexts();
    expect(labels[0]).toMatch(/Your title/);
    expect(labels[1]).toMatch(/Full name/);
  });

  test("city: typing 'pu' offers Pune, Maharashtra, India and picking it fills the box", async ({ page }) => {
    await fresh(page);
    const city = page.getByLabel("City, country");
    await city.fill("pu");
    const list = page.getByRole("listbox", { name: "Places" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("option").first()).toContainText("Pune");
    await expect(list.getByRole("option").first()).toContainText("Maharashtra, India");
    await list.getByRole("option").first().click();
    await expect(city).toHaveValue("Pune, Maharashtra, India");
    await expect(list).toBeHidden();
    await settle(page);
    expect((await stored(page)).resume.contact.location).toBe("Pune, Maharashtra, India");
  });

  test("city: the keyboard works, and a place that is not in the list can still be typed", async ({ page }) => {
    await fresh(page);
    const city = page.getByLabel("City, country");
    await city.fill("mum");
    await expect(page.getByRole("listbox", { name: "Places" })).toBeVisible();
    await city.press("ArrowDown"); // wraps within the list
    await city.press("ArrowUp");
    await city.press("Enter");
    await expect(city).toHaveValue(/^Mumbai, Maharashtra, India$/);
    await city.fill("Smallville, Kansas");
    await city.press("Escape");
    await city.blur();
    await settle(page);
    await page.reload();
    await expect(page.getByLabel("City, country")).toHaveValue("Smallville, Kansas");
  });

  test("phone: a country list, and the code follows the city until you choose one", async ({ page }) => {
    await fresh(page);
    const code = page.getByLabel("Country code");
    const num = page.getByLabel("Phone");
    await expect(code).toHaveValue("");
    await page.getByLabel("City, country").fill("lon");
    await page.getByRole("option", { name: /London/ }).click();
    await expect(code).toHaveValue("GB"); // follows the city
    await num.fill("7700 900123");
    await settle(page);
    expect((await stored(page)).resume.contact.phone).toBe("+44 7700 900123");
    // choosing another country by hand re-writes the code and keeps the number
    await code.selectOption("US");
    await settle(page);
    expect((await stored(page)).resume.contact.phone).toBe("+1 7700 900123");
    // after a reload it still reads back the same way
    await page.reload();
    await expect(page.getByLabel("Country code")).toHaveValue("US");
    await expect(page.getByLabel("Phone")).toHaveValue("7700 900123");
    // letters are not accepted in a phone number
    await page.getByLabel("Phone").fill("98x76abc");
    await expect(page.getByLabel("Phone")).toHaveValue("9876");
  });

  test("phone: a number pasted with its code picks that country", async ({ page }) => {
    await fresh(page);
    await page.getByLabel("Phone").fill("+91 98765 43210");
    await expect(page.getByLabel("Country code")).toHaveValue("IN");
    await expect(page.getByLabel("Phone")).toHaveValue("98765 43210");
    await settle(page);
    expect((await stored(page)).resume.contact.phone).toBe("+91 98765 43210");
  });

  test("an India city picks the +91 code for a new phone number", async ({ page }) => {
    await fresh(page);
    await page.getByLabel("City, country").fill("pun");
    await page.getByRole("listbox", { name: "Places" }).getByRole("option").first().click();
    await expect(page.getByLabel("Country code")).toHaveValue("IN");
    await page.getByLabel("Phone").fill("98765 43210");
    await settle(page);
    expect((await stored(page)).resume.contact.phone).toBe("+91 98765 43210");
  });

  test("middle name: kept in full here, left off the resume when asked, and back when unticked", async ({ page }) => {
    await fresh(page);
    const hide = page.getByLabel("Leave my middle name off my resume");
    await page.getByLabel("Full name").fill("Asha Rao");
    await expect(hide).toBeDisabled(); // no middle name to hide
    await page.getByLabel("Full name").fill("Asha Kumari Rao");
    await expect(hide).toBeEnabled();
    await hide.check();
    await expect(page.getByText("On your resume:")).toContainText("Asha Rao");
    await settle(page);
    let s = await stored(page);
    expect(s.resume.contact.fullName).toBe("Asha Rao");
    expect(s.nameFull).toBe("Asha Kumari Rao");
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Kumari Rao"); // full name stays in the profile
    await expect(page.getByLabel("Leave my middle name off my resume")).toBeChecked();
    // editing the name keeps the choice
    await page.getByLabel("Full name").fill("Asha Kumari Rao Nair");
    await settle(page);
    s = await stored(page);
    expect(s.resume.contact.fullName).toBe("Asha Nair");
    await page.getByLabel("Leave my middle name off my resume").uncheck();
    await settle(page);
    s = await stored(page);
    expect(s.resume.contact.fullName).toBe("Asha Kumari Rao Nair");
  });

  test("the resume gets the name without the middle name", async ({ page }) => {
    await fresh(page);
    await page.getByLabel("Full name").fill("Asha Kumari Rao");
    await page.getByLabel("Leave my middle name off my resume").check();
    await page.getByLabel("Email").fill("asha@example.com");
    await settle(page);
    await page.goto("/quick");
    await expect(page.getByLabel("Profile summary")).toContainText("Asha Rao");
    await expect(page.getByLabel("Profile summary")).not.toContainText("Kumari");
  });
});

test.describe("links", () => {
  test("a link you added is not offered again, and comes back when removed", async ({ page }) => {
    await fresh(page);
    const add = page.getByRole("group", { name: "Add a link" });
    await expect(add.getByRole("button")).toHaveCount(4);
    await add.getByRole("button", { name: "+ LinkedIn" }).click();
    await expect(add.getByRole("button", { name: "+ LinkedIn" })).toHaveCount(0);
    await expect(add.getByRole("button", { name: "+ GitHub" })).toBeVisible();
    await expect(page.getByLabel("Link 1 address")).toHaveAttribute("placeholder", /linkedin\.com\/in\//);
    await add.getByRole("button", { name: "+ GitHub" }).click();
    await expect(add.getByRole("button")).toHaveCount(2); // Portfolio and Other
    await page.getByRole("button", { name: "Remove link 1" }).click();
    await expect(add.getByRole("button", { name: "+ LinkedIn" })).toBeVisible();
    // "Other" can be added more than once
    await add.getByRole("button", { name: "+ Other" }).click();
    await add.getByRole("button", { name: "+ Other" }).click();
    await expect(add.getByRole("button", { name: "+ Other" })).toBeVisible();
  });
});

test.describe("skills", () => {
  test("every chosen skill is listed at the bottom to confirm", async ({ page }) => {
    await fresh(page);
    await page.getByRole("radio", { name: /Software/ }).click();
    const summary = page.getByRole("region", { name: "Your selected skills" });
    await expect(summary).toContainText("None yet");
    const group = page.getByRole("group", { name: /skills$/ }).first();
    const first = await group.getByRole("button").nth(0).innerText();
    const second = await group.getByRole("button").nth(1).innerText();
    await group.getByRole("button").nth(0).click();
    await group.getByRole("button").nth(1).click();
    await expect(summary).toContainText(first.replace("✓", "").trim());
    await expect(summary).toContainText(second.replace("✓", "").trim());
    await expect(summary).toContainText("(2 of 30)");
    await page.getByRole("textbox", { name: /another .* skill/ }).first().fill("Kubernetes Operators");
    await page.getByRole("button", { name: /^Add: another/ }).first().click();
    await expect(summary).toContainText("Kubernetes Operators");
    await expect(summary).toContainText("(3 of 30)");
    // untapping removes it from the list
    await group.getByRole("button").nth(0).click();
    await expect(summary).toContainText("(2 of 30)");
    await expect(summary.getByRole("listitem").filter({ hasText: first.replace("✓", "").trim() })).toHaveCount(0);
  });
});

test.describe("work experience and education", () => {
  test("a role's city is required: it is flagged until filled, and the box suggests places", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "+ Add a role" }).click();
    const role = page.getByLabel("Role 1");
    await expect(role.getByText("Add the city this job was in.")).toHaveCount(0); // nothing typed yet, nothing to nag about
    await role.getByLabel("Job title").fill("Developer");
    await expect(role.getByText("Add the city this job was in.")).toBeVisible();
    const city = role.getByLabel("City", { exact: true });
    await expect(city).toHaveAttribute("aria-required", "true");
    await expect(city).toHaveAttribute("aria-invalid", "true");
    await city.fill("ban");
    await role.getByRole("option", { name: /Bengaluru/ }).click();
    await expect(city).toHaveValue("Bengaluru, India");
    await expect(role.getByText("Add the city this job was in.")).toHaveCount(0);
    await expect(role.getByText("(optional)")).toHaveCount(0);
  });

  test("a role that ends before it starts is flagged", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "+ Add a role" }).click();
    const role = page.getByLabel("Role 1");
    await role.getByLabel("Start month").selectOption("Jun");
    await role.getByLabel("Start year").selectOption("2022");
    await role.getByLabel("End month").selectOption("Jan");
    await role.getByLabel("End year").selectOption("2021");
    await expect(role.getByRole("alert")).toContainText("end date is before the start date");
    await role.getByLabel("End year").selectOption("2023");
    await expect(role.getByRole("alert")).toHaveCount(0);
  });

  test("degree is a scrolling dropdown that can be filtered, and your own wording is allowed", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "+ Add education" }).click();
    const edu = page.getByLabel("Education 1");
    const degree = edu.getByLabel("Degree");
    await degree.click();
    const list = page.getByRole("listbox", { name: "Qualifications" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("option")).toHaveCount(15);
    // long lists scroll inside their own box instead of running off the page
    const sc = await list.evaluate((el) => ({ scrolls: el.scrollHeight > el.clientHeight, max: el.clientHeight }));
    expect(sc.scrolls).toBe(true);
    expect(sc.max).toBeLessThanOrEqual(250);
    await list.getByRole("option", { name: "MBA" }).scrollIntoViewIfNeeded();
    await list.getByRole("option", { name: "MBA" }).click();
    await expect(degree).toHaveValue("MBA");
    await degree.fill("M.");
    await expect(page.getByRole("listbox", { name: "Qualifications" }).getByRole("option")).toHaveCount(3); // M.Tech, M.Sc, M.Com
    await degree.fill("B.Des Interaction Design");
    await degree.blur();
    await settle(page);
    expect((await stored(page)).resume.education[0].degree).toBe("B.Des Interaction Design");
    await page.reload();
    await expect(page.getByLabel("Education 1").getByLabel("Degree")).toHaveValue("B.Des Interaction Design");
    // years: the last year before the first is flagged
    await page.getByLabel("Education 1").getByLabel("From year").selectOption("2022");
    await page.getByLabel("Education 1").getByLabel("To year").selectOption("2020");
    await expect(page.getByLabel("Education 1").getByRole("alert")).toContainText("before the first year");
    await page.getByLabel("Education 1").getByLabel("Grade or details (optional)").fill("CGPA 8.4");
    await settle(page);
    expect((await stored(page)).resume.education[0].details).toBe("CGPA 8.4");
  });

  test("a project can have a link", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "+ Add a project" }).click();
    await page.getByLabel("Project name").fill("Sales Radar");
    await page.getByLabel("Link (optional)").fill("https://github.com/meera/sales-radar");
    await settle(page);
    expect((await stored(page)).resume.projects[0].link).toBe("https://github.com/meera/sales-radar");
  });
});

test.describe("on a small screen", () => {
  test("nothing scrolls sideways at 320px and the new controls are big enough to tap", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await fresh(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.getByLabel("Full name").fill("Asha Kumari Rao");
    await page.getByLabel("City, country").fill("bang");
    const first = page.getByRole("listbox", { name: "Places" }).getByRole("option").first();
    await expect(first).toBeVisible();
    const opt = await first.boundingBox();
    expect(opt!.height).toBeGreaterThanOrEqual(44);
    expect(opt!.x + opt!.width).toBeLessThanOrEqual(320);
    await page.getByRole("listbox", { name: "Places" }).getByRole("option").first().click();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "+ LinkedIn" }).click();
    await page.getByLabel("Link 1 address").fill("https://www.linkedin.com/in/a-very-long-profile-name-that-keeps-going-and-going");
    await page.getByLabel("Phone").fill("98765 43210");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    for (const loc of [page.getByRole("button", { name: "Remove link 1" }), page.getByLabel("Leave my middle name off my resume").locator("xpath=..")]) expect((await loc.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "+ Add a role" }).click();
    await page.getByRole("button", { name: "+ Add education" }).click();
    await page.getByLabel("Education 1").getByLabel("Degree").click();
    const list = page.getByRole("listbox", { name: "Qualifications" });
    await expect(list).toBeVisible();
    const box = await list.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await list.getByRole("option", { name: "MBA" }).click();
    for (const loc of [page.getByRole("button", { name: "Remove role 1" }), page.getByRole("button", { name: "Remove education 1" })]) expect((await loc.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`the changed profile sections pass the accessibility scan in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fresh(page);
    const scan = async (label: string) => expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze()).violations.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target + " " + (n.any[0]?.message ?? "")).slice(0, 2).join(" ; ")}`)).toEqual([]);
    await page.getByRole("radio", { name: /Software/ }).click();
    await page.getByLabel("Full name").fill("Asha Kumari Rao");
    await page.getByLabel("Leave my middle name off my resume").check();
    await page.getByLabel("City, country").fill("pu");
    await expect(page.getByRole("listbox", { name: "Places" })).toBeVisible();
    await scan("city list open");
    await page.getByRole("listbox", { name: "Places" }).getByRole("option").first().click();
    await page.getByLabel("Phone").fill("98765 43210");
    await page.getByRole("button", { name: "+ LinkedIn" }).click();
    await page.getByRole("group", { name: /skills$/ }).first().getByRole("button").first().click();
    await page.getByRole("button", { name: "+ Add a role" }).click();
    await page.getByLabel("Role 1").getByLabel("Job title").fill("Developer");
    await scan("role with the city flagged");
    await page.getByRole("button", { name: "+ Add education" }).click();
    await page.getByLabel("Education 1").getByLabel("Degree").click();
    await expect(page.getByRole("listbox", { name: "Qualifications" })).toBeVisible();
    await scan("degree list open");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "+ Add a project" }).click();
    await scan("whole page");
  });
}
