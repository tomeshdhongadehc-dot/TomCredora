import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderDocx } from "@/lib/export/docx";
import { renderLatex } from "@/lib/export/latex";
import { renderPlainText } from "@/lib/export/plaintext";
import { resumeSchema } from "@/lib/schema";
import { SAMPLE_RESUME } from "./fixtures";

const hostile = resumeSchema.parse({
  ...SAMPLE_RESUME,
  summary: "Saved 50% & $5M \\input{/etc/passwd} \\write18{x} #1 a_b",
  experience: [{ ...SAMPLE_RESUME.experience[0], company: "R&D {Labs}", bullets: ["Cut cost 30% via \\def\\x{y} ~ ^ scripts"] }],
});

describe("renderLatex", () => {
  const tex = renderLatex(SAMPLE_RESUME);
  it("produces a complete single-column document", () => {
    expect(tex).toContain("\\documentclass");
    expect(tex).toContain("\\begin{document}");
    expect(tex).toContain("\\end{document}");
    expect(tex).toContain("\\pdfgentounicode=1");
    expect(tex).not.toMatch(/\\begin\{(tabular|multicols|minipage)|\\includegraphics|\\fontawesome/);
  });
  it("renders content in reading order", () => {
    // Classic uses upper-case headings, so match case-insensitively
    const order = ["Summary", "Skills", "Experience", "Education"].map((s) => tex.toLowerCase().indexOf(`\\section*{${s.toLowerCase()}}`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });
  it("omits empty sections", () => {
    const low = tex.toLowerCase();
    expect(low).not.toContain("\\section*{projects}");
    expect(low).not.toContain("\\section*{certifications}");
    expect(low).toContain("\\section*{experience}"); // control: present sections are found by the same check
  });
  it("escapes hostile input so no user-controlled commands survive", () => {
    const out = renderLatex(hostile);
    expect(out).not.toMatch(/\\input\{\/etc/);
    expect(out).not.toMatch(/\\write18/);
    expect(out).not.toMatch(/\\def\\x/);
    expect(out).toContain("R\\&D \\{Labs\\}");
    expect(out).toContain("50\\% \\& \\$5M");
    // only the template's own \input{glyphtounicode} may remain
    expect(out.match(/\\input\{/g)).toHaveLength(1);
  });
});

describe("renderPlainText", () => {
  const txt = renderPlainText(SAMPLE_RESUME);
  it("lists sections in recruiter reading order", () => {
    const idx = ["ASHA RAO", "SUMMARY", "SKILLS", "EXPERIENCE", "EDUCATION"].map((s) => txt.indexOf(s));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
  it("uses ascii-only punctuation", () => {
    const r = resumeSchema.parse({ ...SAMPLE_RESUME, summary: "\u201CQuoted\u201D \u2014 dash \u2022" });
    expect(renderPlainText(r)).not.toMatch(/[\u2018-\u201D\u2013\u2014\u2022]/);
  });
});

describe("renderDocx", () => {
  it("is a valid, single-column, table-free document containing the text", async () => {
    const buf = await renderDocx(SAMPLE_RESUME);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Asha Rao");
    expect(xml).toContain("Frontend Engineer");
    expect(xml).toContain("12,000 customers");
    expect(xml).not.toContain("<w:tbl>");
    expect(xml).not.toContain("<w:drawing");
    expect(xml).not.toContain("<w:txbxContent");
    expect(xml).not.toContain("<w:cols w:num=\"2\"");
  });
  it("survives hostile text", async () => {
    const buf = await renderDocx(hostile);
    const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
    expect(xml).toContain("R&amp;D {Labs}");
  });
});
