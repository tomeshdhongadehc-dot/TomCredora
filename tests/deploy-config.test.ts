import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Settings that only matter once deployed, and fail in confusing ways if they drift apart. */
const read = (f: string) => readFileSync(f, "utf8");

describe("deployment settings", () => {
  it("the platform's time limit for the AI route is above the handler's own limit (so users see our message, not a platform error)", () => {
    const route = Number(/export const maxDuration = (\d+)/.exec(read("src/app/api/v1/tailor/route.ts"))?.[1]);
    const handler = Number(/timeoutMs \?\? ([\d_]+)/.exec(read("src/lib/api/tailor-handler.ts"))?.[1]?.replace(/_/g, ""));
    expect(route).toBeGreaterThan(0);
    expect(handler).toBeGreaterThan(0);
    expect(route * 1000).toBeGreaterThan(handler);
  });

  it("vercel.json is valid, uses the framework preset and the region next to the database", () => {
    const v = JSON.parse(read("vercel.json"));
    expect(v.framework).toBe("nextjs");
    expect(v.regions).toEqual(["hnd1"]); // Tokyo, where the Supabase project lives
  });

  it(".vercelignore skips tests but never the files the site needs to build", () => {
    const lines = read(".vercelignore").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    for (const need of ["src", "public", "package.json", "next.config.ts", "supabase", "tsconfig.json"]) expect(lines, need).not.toContain(need);
    for (const skip of ["e2e", "tests", "test-results"]) expect(lines, skip).toContain(skip);
  });

  it(".vercelignore keeps secret files out of every upload", () => {
    const lines = read(".vercelignore").split(/\r?\n/).map((l) => l.trim());
    expect(lines).toContain(".env*"); // .env.local holds the Gemini key and a Vercel token
  });

  it("the Node version is pinned to what Next.js needs", () => {
    expect(JSON.parse(read("package.json")).engines.node).toMatch(/>=\s*20/);
  });
});
