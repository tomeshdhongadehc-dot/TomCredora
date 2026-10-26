import JSZip from "jszip";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumePaper } from "@/components/ResumePaper";
import { renderDocx } from "@/lib/export/docx";
import { renderLatex } from "@/lib/export/latex";
import { renderPlainText } from "@/lib/export/plaintext";
import { SAMPLE_RESUME as DEMO } from "@/lib/sample";
import { guardConfig, nameIsAccent, parseConfig, presetById, templateConfigSchema, type TemplateConfig } from "@/lib/templates";

const curve = presetById("curve").config;
const classic = presetById("classic").config;
const html = (cfg: TemplateConfig) => renderToStaticMarkup(createElement(ResumePaper, { resume: DEMO, config: cfg, mode: "print", showGuide: false }));
const docXml = async (cfg: TemplateConfig) => (await JSZip.loadAsync(await renderDocx(DEMO, cfg))).file("word/document.xml")!.async("string");

describe("the Curve template (single column; coloured lead terms, dash lines, heading-less intro)", () => {
  it("is a valid preset and ships with no design warnings", () => {
    expect(templateConfigSchema.safeParse(curve).success).toBe(true);
    expect(guardConfig(curve)).toEqual([]);
    expect(curve.untitled).toEqual(["summary"]);
  });

  it("HTML: accent-coloured name, contact line and lead terms; an em-dash line with the dates on the right", () => {
    const h = html(curve);
    expect(h).toMatch(/<h1[^>]*font-weight:400[^>]*color:#1f3a5f|<h1[^>]*color:#1f3a5f[^>]*font-weight:400/);
    expect(h).toContain("ASHA RAO");
    expect(h).toContain('<span style="color:#1f3a5f">asha.rao@example.com</span> · <span style="color:#1f3a5f">+91 90000 00000</span>');
    expect(h).toContain('<span style="color:#1f3a5f">Senior Frontend Engineer</span> — Acme Corp, Bengaluru');
    expect(h).toMatch(/<span>Jan 2022 - Present<\/span>/);
    expect(h).toContain('<span style="color:#1f3a5f">Languages</span> — TypeScript, JavaScript, HTML, CSS');
  });

  it("HTML: the summary is drawn WITHOUT a heading, but every other section keeps one (regular weight)", () => {
    const h = html(curve);
    const headings = [...h.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toEqual(["Skills", "Experience", "Education", "Certifications"]);
    expect(h).toContain("Frontend engineer with 6 years building React"); // text is still there
    expect(h).toMatch(/<h2[^>]*font-weight:400/);
  });

  it("plain text (what an ATS reads): no invented SUMMARY line, but the intro and other headings are present", () => {
    const t = renderPlainText(DEMO, curve);
    expect(t).not.toContain("SUMMARY");
    expect(t).toContain("Frontend engineer with 6 years");
    for (const h of ["SKILLS", "EXPERIENCE", "EDUCATION"]) expect(t).toContain(h);
    expect(t.indexOf("Frontend engineer with 6 years")).toBeLessThan(t.indexOf("SKILLS"));
  });

  it("LaTeX: lead terms via \\leadfmt in accent colour, a dash entry macro, no summary heading, light headings", () => {
    const tex = renderLatex(DEMO, curve);
    expect(tex).toContain("\\newcommand{\\leadfmt}[1]{\\textcolor[HTML]{1F3A5F}{#1}}");
    expect(tex).toContain("\\entrydash{Senior Frontend Engineer}{ --- Acme Corp, Bengaluru}{Jan 2022 -- Present}");
    expect(tex).toContain("\\leadfmt{Languages} --- TypeScript, JavaScript, HTML, CSS");
    expect(tex.toLowerCase()).not.toContain("\\section*{summary}");
    expect(tex).toContain("\\section*{Skills}");
    expect(tex).toContain("\\titleformat{\\section}{\\normalfont\\large}");
    expect(tex).toContain("\\textperiodcentered{}");
    expect(tex).toContain("\\textcolor[HTML]{1F3A5F}{asha.rao@example.com}");
    expect(tex).toContain("{\\LARGE\\normalfont \\color[HTML]{1F3A5F} \\textls[80]{ASHA RAO}}");
  });

  it("LaTeX: the default template is unchanged (bold lead terms, no accent)", () => {
    const tex = renderLatex(DEMO, classic);
    expect(tex).toContain("\\newcommand{\\leadfmt}[1]{\\textbf{#1}}");
    expect(tex).toContain("\\entry{Acme Corp}{Jan 2022 -- Present}");
    expect(tex).toContain("\\section*{SUMMARY}");
  });

  it("DOCX: em dash between the role and the company, accent colour on lead terms, no summary heading", async () => {
    const xml = await docXml(curve);
    expect(xml).toContain("Senior Frontend Engineer");
    expect(xml).toMatch(/<w:t xml:space="preserve"> — <\/w:t>/);
    expect(xml.toLowerCase()).toContain('w:val="1f3a5f"');
    expect(xml).not.toContain(">Summary<");
    expect(xml).toContain(">Skills<");
  });
});

describe("each new option on its own", () => {
  const set = (o: Partial<TemplateConfig>): TemplateConfig => ({ ...classic, ...o });

  it("nameIsAccent: auto follows size (old behaviour), explicit choices win", () => {
    expect(nameIsAccent(set({ nameColor: "auto", nameSize: "xl" }))).toBe(true);
    expect(nameIsAccent(set({ nameColor: "auto", nameSize: "lg" }))).toBe(false);
    expect(nameIsAccent(set({ nameColor: "accent", nameSize: "md" }))).toBe(true);
    expect(nameIsAccent(set({ nameColor: "ink", nameSize: "xl" }))).toBe(false);
  });

  it("heading weight and name weight reach the preview", () => {
    expect(html(set({ headingWeight: "regular" }))).toMatch(/<h2[^>]*font-weight:400/);
    expect(html(set({ headingWeight: "bold" }))).toMatch(/<h2[^>]*font-weight:700/);
    expect(html(set({ nameWeight: "regular" }))).toMatch(/<h1[^>]*font-weight:400/);
  });

  it("lead style: bold uses <strong>, accent uses a coloured span", () => {
    expect(html(set({ leadStyle: "bold" }))).toContain("<strong>Languages:</strong>");
    expect(html(set({ leadStyle: "accent", accent: "maroon" }))).toContain('<span style="color:#7a1f2b">Languages:</span>');
  });

  it("any section can be drawn without a heading, in every output", async () => {
    const cfg = set({ untitled: ["skills"] });
    expect(html(cfg)).not.toContain(">Skills<");
    expect(renderPlainText(DEMO, cfg)).not.toContain("SKILLS");
    expect(renderLatex(DEMO, cfg).toLowerCase()).not.toContain("section*{skills}");
    expect(await docXml(cfg)).not.toContain(">SKILLS<");
    expect(renderPlainText(DEMO, cfg)).toContain("Languages: TypeScript");
  });

  it("the guard warns when a non-summary section loses its heading, but not for the summary", () => {
    expect(guardConfig(set({ untitled: ["summary"] })).map((w) => w.id)).not.toContain("untitled-summary");
    expect(guardConfig(set({ untitled: ["experience"] })).map((w) => w.id)).toContain("untitled-experience");
  });

  it("configs saved before these options existed still load, with the old look", () => {
    const legacy: Record<string, unknown> = { ...classic };
    for (const k of ["nameWeight", "nameColor", "contactAccent", "headingWeight", "leadStyle", "untitled"]) delete legacy[k];
    const p = parseConfig(legacy);
    expect(p.nameWeight).toBe("bold");
    expect(p.headingWeight).toBe("bold");
    expect(p.leadStyle).toBe("bold");
    expect(p.untitled).toEqual([]);
    expect(p.contactAccent).toBe(false);
  });

  it("rejects invalid values", () => {
    const ok = (o: object) => templateConfigSchema.safeParse({ ...classic, ...o }).success;
    expect(ok({ leadStyle: "neon" })).toBe(false);
    expect(ok({ dateStyle: "diagonal" })).toBe(false);
    expect(ok({ untitled: ["summary", "summary"] })).toBe(false);
    expect(ok({ untitled: ["hobbies"] })).toBe(false);
  });
});
