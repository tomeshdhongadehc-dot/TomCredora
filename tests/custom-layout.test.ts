import JSZip from "jszip";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumePaper } from "@/components/ResumePaper";
import { renderDocx } from "@/lib/export/docx";
import { renderLatex } from "@/lib/export/latex";
import { renderPlainText } from "@/lib/export/plaintext";
import { SAMPLE_RESUME as DEMO } from "@/lib/sample";
import { PRESETS, contactParts, guardConfig, parseConfig, presetById, sectionTitle, templateConfigSchema, visibleSections, type TemplateConfig } from "@/lib/templates";

const base = presetById("classic").config;
const custom: TemplateConfig = {
  ...base,
  id: "custom-1",
  sectionOrder: ["summary", "experience", "skills", "education", "projects", "certifications"],
  hidden: ["projects", "certifications"],
  sectionTitles: { experience: "Work History", skills: "Core Competencies" },
  contactOrder: ["phone", "email"],
  contactSep: "slash",
  headerAlign: "right",
  sectionGap: "airy",
};
const html = (cfg: TemplateConfig) => renderToStaticMarkup(createElement(ResumePaper, { resume: DEMO, config: cfg, mode: "print", showGuide: false }));
const docXml = async (cfg: TemplateConfig) => (await JSZip.loadAsync(await renderDocx(DEMO, cfg))).file("word/document.xml")!.async("string");

describe("shared helpers", () => {
  it("visibleSections drops hidden sections but keeps the order", () => {
    expect(visibleSections(custom)).toEqual(["summary", "experience", "skills", "education"]);
  });
  it("sectionTitle uses the custom title or the standard one", () => {
    expect(sectionTitle(custom, "experience")).toBe("Work History");
    expect(sectionTitle(custom, "education")).toBe("Education");
  });
  it("contactParts follows the configured order and omits hidden details", () => {
    expect(contactParts(DEMO.contact, custom)).toEqual(["+91 90000 00000", "asha.rao@example.com"]);
    expect(contactParts(DEMO.contact, { ...custom, contactOrder: ["links", "email"] })).toEqual(["https://linkedin.com/in/asharao", "asha.rao@example.com"]);
  });
});

describe("a custom arrangement is honoured by EVERY output", () => {
  it("preview / HTML: order, hidden sections, custom titles, contact order, alignment", () => {
    const h = html(custom);
    const headings = [...h.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toEqual(["Summary", "Work History", "Core Competencies", "Education"]);
    expect(h).not.toContain("Certifications");
    expect(h).not.toContain("Projects");
    expect(h.indexOf("+91 90000 00000 / asha.rao@example.com")).toBeGreaterThan(0);
    expect(h).toContain("text-align:right");
  });

  it("plain text", () => {
    const t = renderPlainText(DEMO, custom);
    const idx = ["SUMMARY", "WORK HISTORY", "CORE COMPETENCIES", "EDUCATION"].map((s) => t.indexOf(s));
    expect(idx.every((i) => i > 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(t).not.toContain("CERTIFICATIONS");
    expect(t).toContain("+91 90000 00000 / asha.rao@example.com");
    expect(t).not.toContain("linkedin.com");
  });

  it("LaTeX", () => {
    const tex = renderLatex(DEMO, custom);
    expect(tex).toContain("\\section*{WORK HISTORY}");
    expect(tex).toContain("\\section*{CORE COMPETENCIES}");
    expect(tex.toLowerCase()).not.toContain("section*{certifications}");
    expect(tex).toContain("\\begin{flushright}");
    expect(tex).toContain("+91 90000 00000 / asha.rao@example.com");
    expect(tex).toContain("\\titlespacing*{\\section}{0pt}{13pt}{4pt}");
    expect(tex.indexOf("WORK HISTORY")).toBeLessThan(tex.indexOf("CORE COMPETENCIES"));
  });

  it("DOCX", async () => {
    const xml = await docXml(custom);
    expect(xml).toContain("WORK HISTORY");
    expect(xml).toContain("CORE COMPETENCIES");
    expect(xml).not.toContain("CERTIFICATIONS");
    expect(xml).toContain('<w:jc w:val="right"/>');
    expect(xml).toContain("+91 90000 00000 / asha.rao@example.com");
  });

  it("stacked contact: one detail per line in every output", async () => {
    const stacked = { ...custom, contactLayout: "stacked" as const, contactOrder: ["email", "phone", "location", "links"] as TemplateConfig["contactOrder"] };
    expect(html(stacked).match(/<p style="font-size:0.95em">/g)).toHaveLength(4);
    expect(renderPlainText(DEMO, stacked).split("\n").slice(2, 6)).toEqual(["asha.rao@example.com", "+91 90000 00000", "Bengaluru, India", "https://linkedin.com/in/asharao"]);
    expect(renderLatex(DEMO, stacked)).toMatch(/asha\.rao@example\.com\\\\\n\s+\+91 90000 00000/);
    expect((await docXml(stacked)).match(/asha\.rao@example\.com|\+91 90000 00000|Bengaluru, India/g)).toHaveLength(3);
  });

  it("separators: dot becomes a LaTeX \\textperiodcentered and an ASCII pipe in plain text", () => {
    const dot = { ...base, contactSep: "dot" as const };
    expect(renderLatex(DEMO, dot)).toContain("\\textperiodcentered{}");
    expect(renderPlainText(DEMO, dot)).toContain("asha.rao@example.com | +91 90000 00000");
    expect(html(dot)).toContain("asha.rao@example.com · +91 90000 00000");
  });

  it("every preset still produces identical output to before (defaults are no-ops)", () => {
    for (const p of PRESETS) {
      expect(p.config.hidden).toEqual([]);
      // only "Standard" ships a renamed heading (Technical Skills); every other preset uses the standard names
      expect(p.config.sectionTitles).toEqual(p.id === "standard" ? { skills: "Technical Skills" } : {});
      expect(p.config.contactOrder).toEqual(["email", "phone", "location", "links"]);
      expect(visibleSections(p.config)).toEqual(p.config.sectionOrder);
    }
  });
});

describe("validation: a custom config is untrusted input", () => {
  const parse = (o: object) => templateConfigSchema.safeParse({ ...base, ...o }).success;
  it("accepts reasonable custom titles", () => {
    expect(parse({ sectionTitles: { experience: "Work History", skills: "Technical Skills & Tools" } })).toBe(true);
  });
  it("rejects markup, digits, overlong titles, unknown sections and empty titles", () => {
    expect(parse({ sectionTitles: { experience: "<script>alert(1)</script>" } })).toBe(false);
    expect(parse({ sectionTitles: { experience: "Top 10 things" } })).toBe(false);
    expect(parse({ sectionTitles: { experience: "x".repeat(31) } })).toBe(false);
    expect(parse({ sectionTitles: { experience: "   " } })).toBe(false);
    expect(parse({ sectionTitles: { nonsense: "Hello" } })).toBe(false);
  });
  it("rejects duplicate or unknown contact fields and hidden sections", () => {
    expect(parse({ contactOrder: ["email", "email"] })).toBe(false);
    expect(parse({ contactOrder: ["fax"] })).toBe(false);
    expect(parse({ hidden: ["projects", "projects"] })).toBe(false);
    expect(parse({ hidden: ["hobbies"] })).toBe(false);
    expect(parse({ sectionGap: "huge" })).toBe(false);
  });
  it("parseConfig falls back safely on a tampered custom config", () => {
    expect(parseConfig({ ...custom, sectionTitles: { experience: "<b>" } })).toEqual(base);
  });
});

describe("guard rails", () => {
  const ids = (o: object) => guardConfig({ ...base, ...o }).map((w) => w.id);
  it("warns when email is hidden, when Experience is hidden, and on non-standard headings", () => {
    expect(ids({ contactOrder: ["phone"] })).toContain("email-hidden");
    expect(ids({ hidden: ["experience"] })).toContain("exp-hidden");
    expect(ids({ sectionTitles: { experience: "My Journey" } })).toContain("title-experience");
    expect(ids({ sectionTitles: { experience: "Work History" } })).not.toContain("title-experience");
    expect(ids({ sectionTitles: { skills: "Core Competencies" } })).not.toContain("title-skills");
  });
  it("is silent for a sensible custom arrangement", () => {
    expect(guardConfig(custom)).toEqual([]);
  });
});
