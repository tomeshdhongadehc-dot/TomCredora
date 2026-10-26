import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderDocx } from "@/lib/export/docx";
import { renderLatex } from "@/lib/export/latex";
import { renderPlainText } from "@/lib/export/plaintext";
import { SAMPLE_RESUME as DEMO } from "@/lib/sample";
import { DEFAULT_CONFIG, PRESETS, parseConfig, presetById, sameConfig, type TemplateConfig } from "@/lib/templates";

const engineer = presetById("engineer").config;
const minimal = presetById("minimal").config;
const exec = presetById("executive").config;
const docXml = async (cfg: TemplateConfig) => (await JSZip.loadAsync(await renderDocx(DEMO, cfg))).file("word/document.xml")!.async("string");

describe("layout options (entry order, date style, skills style, name size)", () => {
  it("older saved configs without the new fields still parse, with safe defaults", () => {
    const legacy = { ...DEFAULT_CONFIG } as Record<string, unknown>;
    for (const k of ["nameSize", "entryOrder", "dateStyle", "skillsStyle"]) delete legacy[k];
    const parsed = parseConfig(legacy);
    expect(parsed.entryOrder).toBe("company-first");
    expect(parsed.dateStyle).toBe("right");
    expect(parsed.id).toBe("classic");
  });

  it("LaTeX: role-first puts the title in the bold slot; company-first the employer", () => {
    expect(renderLatex(DEMO, engineer)).toContain("\\entry{Senior Frontend Engineer}{Jan 2022 -- Present}\n\\entrysub{Acme Corp}{Bengaluru}");
    expect(renderLatex(DEMO, DEFAULT_CONFIG)).toContain("\\entry{Acme Corp}{Jan 2022 -- Present}\n\\entrysub{Senior Frontend Engineer}{Bengaluru}");
  });

  it("LaTeX: inline dates produce one linear line per entry", () => {
    const tex = renderLatex(DEMO, minimal);
    expect(tex).toContain("\\entryinline{Acme Corp}{ | Senior Frontend Engineer | Jan 2022 -- Present | Bengaluru}");
    expect(tex).not.toContain("\\entry{");
  });

  it("LaTeX: inline skills, accent headings and name size", () => {
    const tex = renderLatex(DEMO, exec);
    expect(tex).toContain(" ~|~ ");
    expect(tex).toContain("\\bfseries\\large\\color[HTML]{7A1F2B}");
    expect(tex).toContain("{\\huge\\bfseries");
    expect(renderLatex(DEMO, DEFAULT_CONFIG)).toContain("{\\Large\\bfseries");
    expect(renderLatex(DEMO, engineer)).toContain("{\\LARGE\\bfseries");
  });

  it("plain text: role-first vs company-first, always one linear line", () => {
    expect(renderPlainText(DEMO, engineer)).toContain("Senior Frontend Engineer | Acme Corp | Jan 2022 - Present");
    expect(renderPlainText(DEMO, DEFAULT_CONFIG)).toContain("Acme Corp | Senior Frontend Engineer | Jan 2022 - Present");
  });

  it("DOCX: inline entries are one paragraph with no tab; split entries use a right tab", async () => {
    const inline = await docXml(minimal);
    expect(inline).toContain("Acme Corp");
    expect(inline).toContain(" | Senior Frontend Engineer | Jan 2022 - Present");
    expect(inline).not.toContain("<w:tabs>");
    expect(await docXml(DEFAULT_CONFIG)).toContain('<w:tab w:val="right"');
  });

  it("every preset renders every export, keeps all content, and produces balanced LaTeX", async () => {
    for (const p of PRESETS) {
      const tex = renderLatex(DEMO, p.config);
      const txt = renderPlainText(DEMO, p.config);
      const xml = await docXml(p.config);
      for (const needle of ["Acme Corp", "Globex", "VTU", "TypeScript", "Rebuilt checkout"]) {
        expect(tex, `${p.id} tex ${needle}`).toContain(needle);
        expect(txt, `${p.id} txt ${needle}`).toContain(needle);
        expect(xml, `${p.id} docx ${needle}`).toContain(needle);
      }
      expect(tex.split("\\begin{document}").length - 1, p.id).toBe(1);
      expect(tex.split("\\end{document}").length - 1, p.id).toBe(1);
      expect(tex.split("\\begin{itemize}").length, p.id).toBe(tex.split("\\end{itemize}").length);
      // braces must balance (a stray { or } is the most common way generated LaTeX fails to compile)
      const stripped = tex.replace(/\\[{}]/g, "");
      expect((stripped.match(/\{/g) ?? []).length, `${p.id} braces`).toBe((stripped.match(/\}/g) ?? []).length);
    }
  });
});

describe("config round-trip (regression: key order made a selected preset look 'Customised' after reload)", () => {
  it("every preset survives JSON + schema parsing and still compares equal", () => {
    for (const p of PRESETS) {
      const restored = parseConfig(JSON.parse(JSON.stringify(p.config)));
      expect(sameConfig(p.config, restored), p.id).toBe(true);
      expect(restored).toEqual(p.config);
    }
  });
  it("sameConfig ignores key order but detects real differences", () => {
    const reordered = Object.fromEntries(Object.entries(DEFAULT_CONFIG).reverse()) as TemplateConfig;
    expect(sameConfig(DEFAULT_CONFIG, reordered)).toBe(true);
    expect(sameConfig(DEFAULT_CONFIG, { ...DEFAULT_CONFIG, sizePt: 12 })).toBe(false);
    expect(sameConfig(DEFAULT_CONFIG, { ...DEFAULT_CONFIG, sectionOrder: [...DEFAULT_CONFIG.sectionOrder].reverse() })).toBe(false);
  });
});
