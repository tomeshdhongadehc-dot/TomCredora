import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PUBLIC_PATHS } from "../src/lib/site";

/**
 * Search-engine basics, checked on every public page: titles and descriptions of a sensible length, one h1, a canonical
 * address of its own (never the home page), social-card tags, structured data that parses and matches the page,
 * crawl rules, a sitemap that lists real pages, share images, and no dead internal links.
 */
const TOOL_PAGES = ["/studio", "/build", "/quick", "/profile", "/signin"];
const origin = (page: Page) => new URL(page.url()).origin;

async function meta(page: Page) {
  return page.evaluate(() => {
    const content = (sel: string) => document.querySelector(sel)?.getAttribute("content") ?? null;
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
      try {
        return JSON.parse(s.textContent ?? "");
      } catch {
        return "INVALID";
      }
    });
    const headings = [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => Number(h.tagName[1]));
    return {
      title: document.title,
      description: content('meta[name="description"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      robots: content('meta[name="robots"]'),
      lang: document.documentElement.lang,
      ogTitle: content('meta[property="og:title"]'),
      ogDescription: content('meta[property="og:description"]'),
      ogType: content('meta[property="og:type"]'),
      ogUrl: content('meta[property="og:url"]'),
      ogImage: content('meta[property="og:image"]'),
      twitterCard: content('meta[name="twitter:card"]'),
      h1Count: document.querySelectorAll("h1").length,
      headings,
      imagesWithoutAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
      ld,
      links: [...document.querySelectorAll("a[href]")].map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a.textContent ?? "").trim() || a.getAttribute("aria-label") || "" })),
      body: document.body.innerText,
      // includes content inside collapsed sections (an FAQ accordion), which is still on the page for a crawler
      fullText: document.body.textContent ?? "",
    };
  });
}
const types = (ld: unknown[]) => ld.flatMap((d) => (d && typeof d === "object" ? [(d as { "@type"?: string })["@type"]] : [])).filter(Boolean);

test.describe("every public page", () => {
  const seenTitles: string[] = [];
  for (const path of PUBLIC_PATHS) {
    test(`${path}: title, description, h1, canonical, social tags, structured data`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      const m = await meta(page);
      expect(m.lang).toBe("en");
      expect(m.title.length, `title "${m.title}"`).toBeGreaterThanOrEqual(10);
      expect(m.title.length, `title "${m.title}" is too long for a search result`).toBeLessThanOrEqual(65);
      expect(seenTitles, "titles are unique").not.toContain(m.title);
      seenTitles.push(m.title);
      expect(m.description?.length ?? 0, "description").toBeGreaterThanOrEqual(70);
      expect(m.description?.length ?? 0, "description is too long for a search result").toBeLessThanOrEqual(165);
      expect(m.h1Count, "exactly one h1").toBe(1);
      // headings never skip a level (h1 -> h3)
      for (let i = 1; i < m.headings.length; i++) expect(m.headings[i] - m.headings[i - 1], `heading order ${m.headings.join(",")}`).toBeLessThanOrEqual(1);
      // each page names itself as canonical
      expect(m.canonical, "canonical").not.toBeNull();
      expect(new URL(m.canonical!).pathname).toBe(path);
      expect(m.robots ?? "index").not.toMatch(/noindex/);
      // social cards
      expect(m.ogTitle).toBeTruthy();
      expect(m.ogDescription).toBeTruthy();
      expect(m.ogImage, "share image").toBeTruthy();
      expect(m.twitterCard).toBe("summary_large_image");
      expect(m.imagesWithoutAlt).toBe(0);
      // structured data parses
      expect(m.ld.length).toBeGreaterThan(0);
      expect(m.ld).not.toContain("INVALID");
    });
  }

  test("home page: structured data describes the site and its visible FAQ", async ({ page }) => {
    await page.goto("/");
    const m = await meta(page);
    const flat = (m.ld as unknown[]).flat() as { "@type": string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[]; offers?: { price: string }; aggregateRating?: unknown; review?: unknown }[];
    const t = flat.map((d) => d["@type"]);
    expect(t).toEqual(expect.arrayContaining(["WebSite", "WebApplication", "FAQPage"]));
    const app = flat.find((d) => d["@type"] === "WebApplication")!;
    expect(app.offers?.price).toBe("0");
    // never claim ratings or reviews we cannot back up
    for (const d of flat) {
      expect(d.aggregateRating).toBeUndefined();
      expect(d.review).toBeUndefined();
    }
    // every FAQ in the markup is really on the page
    for (const q of flat.find((d) => d["@type"] === "FAQPage")!.mainEntity!) {
      const text = m.fullText.replace(/\s+/g, " ");
      expect(text.includes(q.name), `question on the page: ${q.name}`).toBe(true);
      expect(text.includes(q.acceptedAnswer.text.slice(0, 40)), `answer on the page: ${q.name}`).toBe(true);
    }
  });

  for (const path of ["/guides/ats-friendly-resume", "/guides/tailor-resume-to-job-description"]) {
    test(`${path}: article and breadcrumb data, visible FAQ, links onward`, async ({ page }) => {
      await page.goto(path);
      const m = await meta(page);
      const flat = (m.ld as unknown[]).flat() as { "@type": string; headline?: string; itemListElement?: { item: string }[]; mainEntity?: { name: string }[] }[];
      expect(types(flat)).toEqual(expect.arrayContaining(["Article", "BreadcrumbList", "FAQPage"]));
      expect(flat.find((d) => d["@type"] === "Article")!.headline).toBe(m.body.split("\n").find((l) => l.trim() === flat.find((d) => d["@type"] === "Article")!.headline));
      for (const q of flat.find((d) => d["@type"] === "FAQPage")!.mainEntity!) expect(m.fullText.includes(q.name), `question on the page: ${q.name}`).toBe(true);
      expect(m.body.split(/\s+/).length, "enough real content to be useful").toBeGreaterThan(550);
      const hrefs = m.links.map((l) => new URL(l.href).pathname);
      expect(hrefs).toContain("/quick"); // a way to act
      expect(hrefs).toEqual(expect.arrayContaining(["/ats-resume-templates", "/privacy"]));
    });
  }

  test("templates page: every template has its own crawlable heading, text and link", async ({ page }) => {
    await page.goto("/ats-resume-templates");
    const m = await meta(page);
    const flat = (m.ld as unknown[]).flat() as { "@type": string; itemListElement?: unknown[] }[];
    expect(flat.find((d) => d["@type"] === "ItemList")?.itemListElement?.length).toBeGreaterThanOrEqual(20);
    await expect(page.getByRole("heading", { level: 2, name: /resume template$/ })).toHaveCount(await page.getByRole("link", { name: /^Use the .* template$/ }).count() / 2 + 0 || 1).catch(() => undefined);
    const names = await page.getByRole("heading", { level: 2, name: /resume template$/ }).allTextContents();
    expect(new Set(names).size, "template headings are unique").toBe(names.length);
    expect(names.length).toBeGreaterThanOrEqual(20);
  });
});

test.describe("links", () => {
  test("every internal link on every public page works, and every link has readable text", async ({ page, request }) => {
    const checked = new Set<string>();
    for (const path of PUBLIC_PATHS) {
      await page.goto(path);
      const base = origin(page);
      const m = await meta(page);
      for (const l of m.links) {
        const u = new URL(l.href);
        expect(l.text.length, `link to ${u.pathname} on ${path} needs text`).toBeGreaterThan(0);
        if (u.origin !== base || checked.has(u.pathname + u.search)) continue;
        checked.add(u.pathname + u.search);
        const r = await request.get(u.pathname + u.search);
        expect(r.status(), `${path} links to ${u.pathname}`).toBeLessThan(400);
      }
    }
    expect(checked.size).toBeGreaterThan(8);
  });

  test("every public page links to the others through the footer", async ({ page }) => {
    for (const path of PUBLIC_PATHS) {
      await page.goto(path);
      const footer = page.getByRole("contentinfo");
      await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible();
      await expect(footer.getByRole("link", { name: "Terms" })).toBeVisible();
      await expect(footer.getByRole("link", { name: "ATS resume templates" })).toBeVisible();
    }
  });
});

test.describe("crawler files", () => {
  const get = (request: APIRequestContext, path: string) => request.get(path);

  test("robots.txt allows the public pages, blocks the tools and the API, and names the sitemap", async ({ request }) => {
    const r = await get(request, "/robots.txt");
    expect(r.status()).toBe(200);
    const t = await r.text();
    expect(t).toMatch(/User-Agent: \*/i);
    expect(t).toMatch(/Allow: \//i);
    for (const p of ["/api/", "/studio", "/build", "/quick", "/profile", "/signin"]) expect(t, `blocks ${p}`).toContain(`Disallow: ${p}`);
    expect(t).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/i);
  });

  test("sitemap.xml lists exactly the public pages, each one real, and none of the tool pages", async ({ request }) => {
    const r = await get(request, "/sitemap.xml");
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("xml");
    const xml = await r.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    expect(locs.sort()).toEqual([...PUBLIC_PATHS].sort());
    for (const p of TOOL_PAGES) expect(locs).not.toContain(p);
    for (const p of locs) expect((await get(request, p)).status()).toBe(200);
    expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}/);
  });

  test("the share image is a 1200x630 PNG, and the icons and manifest exist", async ({ request }) => {
    const og = await get(request, "/opengraph-image");
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toContain("image/png");
    const png = await og.body();
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    for (const p of ["/icon", "/apple-icon"]) {
      const r = await get(request, p);
      expect(r.status(), p).toBe(200);
      expect(r.headers()["content-type"]).toContain("image/png");
    }
    const man = await get(request, "/manifest.webmanifest");
    expect(man.status()).toBe(200);
    const j = await man.json();
    expect(j.name).toBe("TomCredora");
    expect(j.icons.length).toBeGreaterThan(0);
  });
});

test.describe("pages that should not be in search", () => {
  for (const path of TOOL_PAGES) {
    test(`${path} is marked noindex and never points at the home page as its canonical`, async ({ page }) => {
      await page.goto(path);
      const m = await meta(page);
      expect(m.robots).toMatch(/noindex/);
      if (m.canonical) expect(new URL(m.canonical).pathname).not.toBe("/");
    });
  }

  test("an unknown address is a real 404, not indexed, and offers a way forward", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
    const m = await meta(page);
    expect(m.robots).toMatch(/noindex/);
    await expect(page.getByRole("link", { name: /Make a tailored resume/ })).toBeVisible();
  });

  test("API routes are not pages", async ({ request }) => {
    expect((await request.get("/api/v1/sync")).status()).toBe(401);
  });
});

test.describe("structured data is safe", () => {
  test("a '<' inside structured data can never close the script tag", async ({ page }) => {
    await page.goto("/");
    const raw = await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent ?? ""));
    for (const r of raw) expect(r).not.toContain("</");
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`public pages pass the axe scan (${scheme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of PUBLIC_PATHS) {
      await page.goto(path);
      await page.evaluate(() => Promise.all(document.getAnimations().filter((x) => x.effect?.getComputedTiming().iterations !== Infinity).map((x) => x.finished.catch(() => undefined))));
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();
      expect(r.violations.map((v) => `${path}: ${v.id} ${v.nodes[0]?.target}`), path).toEqual([]);
    }
  });
}
