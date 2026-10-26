import { expect, test, type Page } from "@playwright/test";

/**
 * Every page, in its main states, at phone, tablet and desktop widths: no sideways scrolling, nothing past the
 * screen edge, no tap target under 24px (WCAG 2.2 AA), no text under 11px. Runs once (desktop project): it sets its
 * own viewport sizes. Found real problems when first run (the template picker was wider than a phone screen).
 */
const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker and Kubernetes required.";
const WIDTHS = [320, 360, 390, 768, 1280];

async function fresh(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
}

const STATES: { name: string; run: (page: Page) => Promise<void> }[] = [
  { name: "landing", run: async (p) => { await fresh(p, "/"); } },
  { name: "build-profile", run: async (p) => { await fresh(p, "/build"); await p.getByRole("button", { name: "Load example" }).click(); } },
  {
    name: "build-design",
    run: async (p) => {
      await fresh(p, "/build");
      await p.getByRole("button", { name: "Load example" }).click();
      await p.getByRole("button", { name: "Continue" }).click();
      await p.getByLabel("Paste the job description").fill(JD);
      await p.getByRole("button", { name: "Continue" }).click();
      await p.getByRole("button", { name: "Continue" }).click();
      await p.getByRole("heading", { name: "Choose a template" }).waitFor();
    },
  },
  { name: "studio", run: async (p) => { await fresh(p, "/studio"); await p.getByRole("button", { name: "Load example" }).click(); } },
  { name: "quick-empty", run: async (p) => { await fresh(p, "/quick"); } },
  {
    name: "quick-result",
    run: async (p) => {
      await fresh(p, "/quick");
      await p.route("**/api/v1/tailor", async (route) => {
        const body = JSON.parse(route.request().postData() ?? "{}");
        await route.fulfill({ json: { resume: body.profile, issues: [], questions: ["Do you have GraphQL experience?"], ledger: [] } });
      });
      await p.getByRole("button", { name: "Load example profile" }).click();
      await p.getByLabel("Paste the job description").fill(JD);
      await p.getByLabel(/These details are accurate/).check();
      await p.getByRole("button", { name: "Create my resume" }).click();
      await p.getByLabel("Your resume", { exact: true }).waitFor();
    },
  },
  { name: "profile", run: async (p) => { await fresh(p, "/profile"); await p.getByRole("button", { name: "Load example" }).click(); } },
  {
    name: "landing-templates-open",
    run: async (p) => {
      await fresh(p, "/");
      await p.getByRole("button", { name: /^View all \d+ templates$/ }).click();
      await p.getByRole("button", { name: "Show fewer templates" }).waitFor();
    },
  },
  { name: "templates-page", run: async (p) => { await fresh(p, "/ats-resume-templates"); } },
  { name: "guide", run: async (p) => { await fresh(p, "/guides/ats-friendly-resume"); } },
  { name: "privacy", run: async (p) => { await fresh(p, "/privacy"); } },
  { name: "signin", run: async (p) => { await fresh(p, "/signin?next=%2Fprofile"); } },
  {
    name: "signin-email-sent",
    run: async (p) => {
      await fresh(p, "/signin?next=%2Fprofile");
      await p.getByLabel("Email address").fill("meera+link@example.com");
      await p.getByRole("button", { name: "Sign in", exact: true }).click();
      await p.getByRole("heading", { name: "Check your email" }).waitFor();
    },
  },
  {
    name: "signin-error",
    run: async (p) => {
      await fresh(p, "/signin?next=%2Fprofile");
      await p.getByLabel("Email address").fill("not-an-email");
      await p.getByRole("button", { name: "Sign in", exact: true }).click();
      await p.getByRole("alert").filter({ hasText: /\S/ }).waitFor();
    },
  },
  {
    name: "account-dialog",
    run: async (p) => {
      await fresh(p, "/profile");
      await p.getByRole("link", { name: "Sign in", exact: true }).click();
      await p.getByLabel("Email address").fill("meera@example.com");
      await p.getByRole("button", { name: "Sign in", exact: true }).click();
      await p.getByRole("button", { name: /Account:/ }).click();
      await p.getByRole("dialog").waitFor();
    },
  },
];

const MEASURE = () => {
  const vw = document.documentElement.clientWidth;
  const vis = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("nextjs-portal,[hidden],[aria-hidden='true'],[data-no-print]");
  };
  const desc = (el: Element) => `${el.tagName.toLowerCase()}${(el as HTMLElement).id ? "#" + (el as HTMLElement).id : ""} "${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 28)}"`;
  const clippedByScroller = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o !== "visible" && p.getBoundingClientRect().right <= vw + 1) return true;
    }
    return false;
  };
  const off: string[] = [];
  const small: string[] = [];
  const tiny = new Set<string>();
  document.querySelectorAll("body *").forEach((el) => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !clippedByScroller(el)) off.push(`${desc(el)} left=${Math.round(r.left)} right=${Math.round(r.right)}`);
  });
  document.querySelectorAll("a,button,input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea,summary,[role=button],[role=radio],[role=tab]").forEach((el) => {
    if (!vis(el) || el.closest(".sr-only") || (el as HTMLElement).className.toString().includes("sr-only")) return;
    const r = el.getBoundingClientRect();
    const inline = el.tagName === "A" && !!el.closest("p,li,span") && getComputedStyle(el).display === "inline";
    if (!inline && (r.width < 24 || r.height < 24)) small.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  document.querySelectorAll("body *").forEach((el) => {
    if (!vis(el) || el.closest("[data-resume-paper],.rp-article,.rp-container")) return;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1);
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (own && fs < 11) tiny.add(`${desc(el)} ${fs}px`);
  });
  // iPhone Safari zooms the page when a text field under 16px is focused: on phone widths every field must be 16px+.
  const smallFields =
    vw > 600
      ? []
      : [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=file]),select,textarea")]
          .filter((el) => vis(el) && parseFloat(getComputedStyle(el).fontSize) < 16)
          .slice(0, 4)
          .map((el) => `${desc(el)} ${getComputedStyle(el).fontSize}`);
  return { overflowX: document.documentElement.scrollWidth - vw, off: off.slice(0, 6), small: small.slice(0, 8), tiny: [...tiny].slice(0, 4), smallFields, height: document.documentElement.scrollHeight };
};


test.describe("responsive: no overflow, big enough targets, readable text", () => {
  test.skip(({ isMobile }) => isMobile, "sets its own viewport sizes; the desktop project covers it");
  test.setTimeout(240_000);
  for (const s of STATES) {
    test(`${s.name}`, async ({ page }) => {
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 800 });
        await s.run(page);
        await page.waitForTimeout(400);
        const m = await page.evaluate(MEASURE);
        const at = `${s.name} at ${w}px`;
        expect(m.overflowX, `${at}: page scrolls sideways by ${m.overflowX}px`).toBeLessThanOrEqual(0);
        expect(m.off, `${at}: elements past the screen edge`).toEqual([]);
        expect(m.small, `${at}: tap targets under 24px`).toEqual([]);
        expect(m.tiny, `${at}: text under 11px`).toEqual([]);
        expect(m.smallFields, `${at}: form fields under 16px make iPhone Safari zoom the page`).toEqual([]);
      }
    });
  }
});
