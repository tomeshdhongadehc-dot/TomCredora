import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT, safeNext, signInHref } from "@/lib/auth/next";

describe("where to go after signing in (an open redirect would let a stranger's link send you to their site)", () => {
  it("keeps ordinary paths on this site, with query and hash", () => {
    for (const ok of ["/profile", "/quick", "/studio", "/build?step=job", "/build?template=slate&step=design", "/guides/ats-friendly-resume#rules"]) expect(safeNext(ok), ok).toBe(ok);
  });

  it("falls back to the default when there is nothing", () => {
    for (const none of [null, undefined, ""]) expect(safeNext(none)).toBe(DEFAULT_NEXT);
  });

  it("refuses every way of leaving the site", () => {
    const attacks = [
      "https://evil.example",
      "http://evil.example/x",
      "//evil.example",
      "///evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "\\/evil.example",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "evil.example",
      "profile",
      " /profile",
      "/pro\nfile",
      "/pro\u0000file",
      "/\tprofile",
      "/".padEnd(400, "a"),
    ];
    for (const a of attacks) expect(safeNext(a), JSON.stringify(a)).toBe(DEFAULT_NEXT);
  });

  it("never sends someone back to the sign-in page itself (a loop)", () => {
    for (const a of ["/signin", "/signin?next=/profile", "/signin/", "/SignIn", "/signin#x"]) expect(safeNext(a), a).toBe(DEFAULT_NEXT);
    expect(safeNext("/signing-guide")).toBe("/signing-guide"); // a different page that merely starts the same way
  });

  it("builds the sign-in address for a page, encoded, and re-checked", () => {
    expect(signInHref("/studio")).toBe("/signin?next=%2Fstudio");
    expect(signInHref("/build?step=job")).toBe("/signin?next=%2Fbuild%3Fstep%3Djob");
    expect(signInHref("//evil.example")).toBe(`/signin?next=${encodeURIComponent(DEFAULT_NEXT)}`);
    // round trip
    expect(safeNext(decodeURIComponent(signInHref("/build?step=job").split("next=")[1]))).toBe("/build?step=job");
  });
});
