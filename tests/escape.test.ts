import { describe, expect, it } from "vitest";
import { asciiPunctuation, escapeHtml, escapeLatex } from "@/lib/escape";

describe("escapeLatex", () => {
  it("escapes every special character", () => {
    expect(escapeLatex("50% & $5 #1 a_b {x} ^~")).toBe(
      "50\\% \\& \\$5 \\#1 a\\_b \\{x\\} \\textasciicircum{}\\textasciitilde{}",
    );
  });
  it("neutralises command injection", () => {
    const out = escapeLatex("\\input{/etc/passwd} \\write18{rm -rf /}");
    expect(out.startsWith("\\textbackslash{}input")).toBe(true);
    expect(out).toContain("\\textbackslash{}write18");
  });
  it("is single-pass (no double escaping)", () => {
    expect(escapeLatex("\\")).toBe("\\textbackslash{}");
  });
  it("never leaves an unescaped dangerous char (fuzz)", () => {
    const chars = "\\{}$&#%_^~ab1 \n";
    const known = /\\(?:textbackslash|textasciicircum|textasciitilde)\{\}|\\[{}$&#%_]/g;
    for (let i = 0; i < 500; i++) {
      let s = "";
      for (let j = 0; j < 20; j++) s += chars[Math.floor(Math.random() * chars.length)];
      expect(escapeLatex(s).replace(known, "")).not.toMatch(/[\\{}$&#%_^~]/);
    }
  });
});

describe("escapeHtml", () => {
  it("escapes markup", () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
      "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;",
    );
  });
});

describe("asciiPunctuation", () => {
  it("normalises smart punctuation", () => {
    expect(asciiPunctuation("\u201Chi\u201D \u2014 it\u2019s\u2026 \u2022")).toBe("\"hi\" - it's... -");
  });
});
