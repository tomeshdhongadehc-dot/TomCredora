import { describe, expect, it } from "vitest";
import { latexText } from "@/lib/escape";
import { renderLatex } from "@/lib/export/latex";
import { SAMPLE_RESUME } from "@/lib/sample";
import { PRESETS, presetById } from "@/lib/templates";
import { resumeSchema } from "@/lib/schema";

describe("latexText: output that always compiles under pdfLaTeX", () => {
  it("transliterates symbols pdfLaTeX cannot typeset (these caused fatal 'Unicode character not set up' errors)", () => {
    expect(latexText("Saved \u20B92M")).toBe("Saved Rs.\\,2M");
    expect(latexText("A \u2192 B \u2265 C")).toBe("A -> B >= C");
    expect(latexText("\u20AC5")).toBe("\\texteuro{}5");
  });

  it("keeps Latin letters from Latin-1 and Latin Extended-A intact", () => {
    expect(latexText("Jos\u00E9 M\u00FCller-\u00D8ster \u00C5ngstr\u00F6m S\u00E3o Paulo")).toBe("Jos\u00E9 M\u00FCller-\u00D8ster \u00C5ngstr\u00F6m S\u00E3o Paulo");
  });

  it("replaces unsupported letters with a visible '?' and drops emoji and invisible characters", () => {
    expect(latexText("\u4F60\u597D team")).toBe("?? team");
    expect(latexText("Shipped \uD83D\uDE80 fast")).toBe("Shipped fast");
    expect(latexText("zero\u200Bwidth")).toBe("zerowidth");
  });

  it("collapses newlines and tabs so words never fuse together", () => {
    expect(latexText("line one\nline\ttwo")).toBe("line one line two");
  });

  it("still escapes every LaTeX special and injected command", () => {
    expect(latexText("50% & $5 #1 a_b {x} ^~")).toBe("50\\% \\& \\$5 \\#1 a\\_b \\{x\\} \\textasciicircum{}\\textasciitilde{}");
    expect(latexText("\\input{/etc/passwd}")).toBe("\\textbackslash{}input\\{/etc/passwd\\}");
  });
});

describe("generated LaTeX is safe for hostile, multilingual content in every template", () => {
  const hostile = resumeSchema.parse({
    ...SAMPLE_RESUME,
    contact: { ...SAMPLE_RESUME.contact, fullName: "Z\u00F6e \u5F20 \u20B9 \uD83D\uDE80" },
    summary: "Saved \u20B92M \u2192 100% faster \\write18{x} \u2713",
  });

  it("contains no raw non-Latin characters that would abort compilation", () => {
    for (const p of PRESETS) {
      const tex = renderLatex(hostile, p.config);
      // everything outside Latin-1 / Latin Extended-A would make pdfLaTeX stop
      expect(/[^\u0000-\u017F]/.test(tex), p.id).toBe(false);
      expect(tex, p.id).not.toContain("\\write18");
    }
  });

  it("loads textcomp and never uses \\uppercase (it swallows the next token and broke accent headings); headings are upper-cased in code", () => {
    for (const p of PRESETS) expect(renderLatex(SAMPLE_RESUME, p.config), p.id).not.toContain("\\uppercase");
    const modern = renderLatex(SAMPLE_RESUME, presetById("modern").config);
    expect(modern).toContain("\\usepackage{textcomp}");
    expect(modern).toContain("\\titleformat{\\section}{\\bfseries\\large\\color[HTML]{1F5F4A}}{}{0em}{}");
    expect(modern).toContain("\\section*{SUMMARY}");
    expect(renderLatex(SAMPLE_RESUME, presetById("executive").config)).toContain("\\section*{Summary}");
  });
});
