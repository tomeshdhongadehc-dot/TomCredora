// Measures the PRODUCTION build in a real browser and enforces budgets.
//   npm run perf        (builds, serves on :3300, measures, exits non-zero on a blown budget)
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

const PORT = 3300;
const BASE = `http://localhost:${PORT}`;
// 2026-10-12 (landing later tightened to 150: it no longer prefetches other pages, so a phone downloads only what the page uses).
// The builder total went from 260 to 270 KB when the builder gained per-step addresses (Back/Forward
// between steps) and saved half-typed text, both requested features (~5 KB). "JS before load" budgets are unchanged.
const BUDGET = { criticalKB: { "/": 150, "/build": 200, "/studio": 300, "/quick": 300 }, jsKB: { "/": 150, "/build": 270, "/studio": 420, "/quick": 420 }, lcpMs: 2000, cls: 0.1, lazyExtraKB: 100 };
const kb = (n) => Math.round(n / 102.4) / 10;

if (!process.env.SKIP_BUILD) {
  const b = spawnSync("npx", ["next", "build"], { stdio: "inherit", shell: true });
  if (b.status !== 0) process.exit(b.status ?? 1);
}
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { shell: true, stdio: "ignore", env: { ...process.env, GEMINI_API_KEY: "" } });
const stop = () => spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { shell: true, stdio: "ignore" });
process.on("exit", stop);

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start");
}

async function measure(browser, path, after) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  let jsBytes = 0;
  let loaded = false;
  let beforeLoad = 0; // JS that arrived before the load event = what the first render actually waits for
  const pending = [];
  page.on("load", () => { loaded = true; });
  page.on("response", (res) => {
    if (res.request().resourceType() !== "script") return;
    const early = !loaded;
    pending.push(res.request().sizes().then((s) => { jsBytes += s.responseBodySize; if (early) beforeLoad += s.responseBodySize; }).catch(() => {}));
  });
  await page.addInitScript(() => {
    window.__m = { lcp: 0, cls: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await Promise.all(pending);
  const m = await page.evaluate(() => window.__m);
  const initialJs = jsBytes;
  const criticalJs = beforeLoad;
  let extra = 0;
  if (after) {
    jsBytes = 0;
    await after(page);
    await page.waitForTimeout(1500);
    await Promise.all(pending);
    extra = jsBytes;
  }
  await ctx.close();
  return { path, criticalKB: kb(criticalJs), jsKB: kb(initialJs), lcpMs: Math.round(m.lcp), cls: Math.round(m.cls * 1000) / 1000, lazyExtraKB: kb(extra) };
}

let failed = false;
try {
  await waitUp();
  const browser = await chromium.launch();
  const rows = [
    await measure(browser, "/"),
    await measure(browser, "/build"),
    await measure(browser, "/studio"),
    await measure(browser, "/quick"),
  ];
  // Export code (docx) must NOT be in the initial load: it should arrive only when exporting.
  const lazy = await measure(browser, "/build", async (page) => {
    await page.getByRole("button", { name: "Load example" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Paste the job description").fill("Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker required.");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download DOCX" }).click()]);
    await dl.path();
  });
  await browser.close();
  console.table([...rows, { ...lazy, path: "/build (after wizard + DOCX export)" }]);

  for (const r of rows) {
    const checks = [
      [`${r.path} JS before load ${r.criticalKB}KB <= ${BUDGET.criticalKB[r.path]}KB`, r.criticalKB <= BUDGET.criticalKB[r.path]],
      [`${r.path} JS incl. idle prefetch ${r.jsKB}KB <= ${BUDGET.jsKB[r.path]}KB`, r.jsKB <= BUDGET.jsKB[r.path]],
      [`${r.path} LCP ${r.lcpMs}ms <= ${BUDGET.lcpMs}ms`, r.lcpMs <= BUDGET.lcpMs],
      [`${r.path} CLS ${r.cls} <= ${BUDGET.cls}`, r.cls <= BUDGET.cls],
    ];
    for (const [msg, ok] of checks) { console.log(ok ? "PASS" : "FAIL", msg); failed ||= !ok; }
  }
  const lazyOk = lazy.lazyExtraKB >= BUDGET.lazyExtraKB;
  console.log(lazyOk ? "PASS" : "FAIL", `export/step code is lazy: +${lazy.lazyExtraKB}KB loaded only after use (>= ${BUDGET.lazyExtraKB}KB)`);
  failed ||= !lazyOk;
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  stop();
}
process.exit(failed ? 1 : 0);
