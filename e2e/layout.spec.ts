import { expect, test } from "@playwright/test";

/**
 * Nothing in a page header or top bar may extend past the screen edge. (A "Workspace" link once pushed the
 * guided builder's top bar off the right of a phone, which also made buttons below it unclickable.)
 */
const PAGES = ["/", "/build", "/studio", "/quick", "/profile"];
const WIDTHS = [360, 390, 412, 768, 1280];

for (const path of PAGES) {
  for (const width of WIDTHS) {
    test(`${path} at ${width}px: no horizontal scroll and no header/nav content past the edge`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForTimeout(600);
      const result = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const clipped: string[] = [];
        document.querySelectorAll("header *, nav *").forEach((el) => {
          if (el.closest("nextjs-portal,[hidden]")) return;
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") return;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (r.right > vw + 1 || r.left < -1) clipped.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 24)}" right=${Math.round(r.right)} (screen ${vw})`);
        });
        return { overflowX: document.documentElement.scrollWidth - vw, clipped: clipped.slice(0, 5) };
      });
      expect(result.overflowX, "horizontal scroll").toBeLessThanOrEqual(0);
      expect(result.clipped).toEqual([]);
    });
  }
}
