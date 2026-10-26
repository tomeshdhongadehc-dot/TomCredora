import { describe, expect, it } from "vitest";
import { buildCsp, supabaseOrigin } from "@/lib/csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("Content-Security-Policy", () => {
  it("lets the page talk only to itself when sign-in is not configured", () => {
    expect(directive(buildCsp({ isDev: false }), "connect-src")).toBe("connect-src 'self'");
  });

  it("allows exactly the one Supabase origin when it is configured (so real sign-in is not blocked)", () => {
    const csp = buildCsp({ isDev: false, supabaseUrl: "https://abcdefgh.supabase.co/some/path?x=1" });
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://abcdefgh.supabase.co");
  });

  it("never opens a wildcard, and ignores a URL that is not a safe origin", () => {
    for (const bad of ["javascript:alert(1)", "ftp://x.example", "http://evil.example", "not a url", "*", "https://*.supabase.co", ""]) {
      const csp = buildCsp({ isDev: false, supabaseUrl: bad });
      expect(directive(csp, "connect-src"), bad).toBe("connect-src 'self'");
    }
    expect(buildCsp({ isDev: false, supabaseUrl: "https://abc.supabase.co" })).not.toContain("*");
  });

  it("allows plain http only for a local Supabase (development)", () => {
    expect(supabaseOrigin("http://localhost:54321")).toBe("http://localhost:54321");
    expect(supabaseOrigin("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
    expect(supabaseOrigin("http://abc.supabase.co")).toBeNull();
  });

  it("keeps the rest strict: no framing, no plugins, scripts only from us, eval only in development", () => {
    const prod = buildCsp({ isDev: false, supabaseUrl: "https://abc.supabase.co" });
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("default-src 'self'");
    expect(directive(prod, "script-src")).not.toContain("unsafe-eval");
    expect(directive(buildCsp({ isDev: true }), "script-src")).toContain("unsafe-eval");
    expect(directive(prod, "form-action")).toBe("form-action 'self' https://www.overleaf.com");
  });
});
