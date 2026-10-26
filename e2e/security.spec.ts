import { expect, test } from "@playwright/test";

test.describe("security headers and runtime behaviour", () => {
  for (const path of ["/", "/build", "/api/v1/resumes"]) {
    test(`hardening headers on ${path}`, async ({ request }) => {
      const r = await request.get(path);
      const h = r.headers();
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["strict-transport-security"]).toMatch(/max-age=\d{7,}/);
      expect(h["permissions-policy"]).toContain("camera=()");
      expect(h["x-powered-by"]).toBeUndefined();
      const csp = h["content-security-policy"];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
    });
  }

  test("API: unauthenticated resume access is 401 with a generic body", async ({ request }) => {
    const r = await request.get("/api/v1/resumes");
    expect(r.status()).toBe(401);
    expect(r.headers()["cache-control"]).toContain("no-store");
    expect(JSON.stringify(await r.json())).not.toMatch(/stack|supabase|at \w+/i);
  });

  test("API: tailor rejects cross-origin, wrong content type and missing idempotency key", async ({ request }) => {
    const base = { data: "{}" };
    const cross = await request.post("/api/v1/tailor", { ...base, headers: { "content-type": "application/json", origin: "https://evil.example" } });
    expect(cross.status()).toBe(403);
    const wrongType = await request.post("/api/v1/tailor", { data: "x", headers: { "content-type": "text/plain" } });
    expect(wrongType.status()).toBe(415);
    const noKey = await request.post("/api/v1/tailor", { ...base, headers: { "content-type": "application/json" } });
    // validation happens before the idempotency key check; either way it must be a clean 4xx
    expect([400, 422]).toContain(noKey.status());
  });

  test("API: unknown route is a clean 404 and unsupported methods do not 500", async ({ request }) => {
    expect((await request.get("/api/v1/nope")).status()).toBe(404);
    const del = await request.delete("/api/v1/resumes");
    expect(del.status()).toBeLessThan(500);
  });

  test("user text is rendered inertly (no script execution from resume content)", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
    await page.goto("/build");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const xss = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    await page.getByLabel("Full name").fill(xss);
    await page.getByLabel("Email").fill("a@b.co");
    await page.getByRole("button", { name: "+ Add role" }).click();
    await page.getByLabel(/What you did/).fill(xss);
    await page.waitForTimeout(500);
    expect(dialogs).toEqual([]);
    expect(await page.locator("[data-resume-paper] img, [data-resume-paper] script").count()).toBe(0);
    await expect(page.locator("[data-resume-paper]")).toContainText("<script>alert(2)</script>");
  });

  test("tampered localStorage cannot break the app or inject config", async ({ page }) => {
    await page.goto("/build");
    await page.evaluate(() =>
      localStorage.setItem("arb.draft.v1", JSON.stringify({ resume: { contact: { fullName: "x".repeat(5000), email: "no" }, evil: 1 }, jd: 123, template: { font: "<script>", sizePt: 9999 } })),
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.reload();
    await expect(page.getByLabel("Full name")).toBeVisible();
    expect(errors).toEqual([]);
    await page.evaluate(() => localStorage.setItem("arb.draft.v1", "{not json"));
    await page.reload();
    await expect(page.getByLabel("Full name")).toBeVisible();
  });
});
