import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `.env.example` is meant to be shared and committed. It once ended up holding a real database password and project
 * URL, so it is checked here: every setting must be blank, and nothing may look like a secret.
 */
const lines = readFileSync(".env.example", "utf8").split(/\r?\n/);
const settings = lines.filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)] as const);

describe(".env.example is safe to share", () => {
  it("lists the settings the app reads", () => {
    const names = settings.map(([k]) => k);
    for (const k of ["GEMINI_API_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) expect(names).toContain(k);
  });

  it("every setting is blank: real values belong in .env.local, which git ignores", () => {
    for (const [k, v] of settings) expect(v.trim(), `${k} must be empty in .env.example`).toBe("");
  });

  it("has no password or service-role setting at all (the app never needs them)", () => {
    for (const [k] of settings) expect(k, k).not.toMatch(/PASSWORD|SERVICE_ROLE|SECRET|PRIVATE/i);
  });

  it("contains no key-looking text anywhere, comments included", () => {
    const text = lines.join("\n");
    expect(text).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/); // Google API key
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/); // a JWT (Supabase keys are JWTs)
    expect(text).not.toMatch(/sb_(publishable|secret)_[A-Za-z0-9_-]{10,}/);
    expect(text).not.toMatch(/https:\/\/[a-z0-9]{15,}\.supabase\.co/); // a real project URL
  });

  it(".env.local is ignored by git and .env.example is not", () => {
    const ignore = readFileSync(".gitignore", "utf8");
    expect(ignore).toMatch(/^\.env\*$/m);
    expect(ignore).toMatch(/^!\.env\.example$/m);
  });
});
