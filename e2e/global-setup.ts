import type { FullConfig } from "@playwright/test";

/**
 * Warm every route once before tests run. The dev server compiles routes on first request;
 * without this, parallel tests all hit cold routes at once and time out on slow machines.
 */
export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0].use.baseURL!;
  const paths = ["/", "/build", "/studio", "/quick", "/profile", "/api/v1/tailor", "/api/v1/resumes", "/api/v1/sync"];
  for (const p of paths) {
    try {
      await fetch(base + p, { method: p === "/api/v1/tailor" ? "POST" : "GET", headers: { "content-type": "application/json" }, body: p === "/api/v1/tailor" ? "{}" : undefined });
    } catch {
      /* the server's own readiness check already passed; a failed warm-up is not fatal */
    }
  }
}
