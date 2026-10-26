import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderDocx } from "@/lib/export/docx";
import { exportFileName } from "@/lib/export/files";
import { renderLatex } from "@/lib/export/latex";
import { renderPlainText } from "@/lib/export/plaintext";
import { resumeSchema } from "@/lib/schema";
import { SAMPLE_RESUME as DEMO } from "@/lib/sample";
import {
  ACCENTS, DEFAULT_CONFIG, PRESETS, guardConfig, inToCqw, pageHeightCqw, parseConfig, presetById, ptToCqw, templateConfigSchema,
} from "@/lib/templates";
import { SAMPLE_RESUME } from "./fixtures";

describe("presets", () => {
  it("all validate against the config schema", () => {
    for (const p of PRESETS) expect(templateConfigSchema.safeParse(p.config).success, p.id).toBe(true);
  });
  it("are genuinely distinct: every pair differs in at least 3 settings (not recolours)", () => {
    const keys = Object.keys(PRESETS[0].config).filter((k) => k !== "id") as (keyof typeof PRESETS[0]["config"])[];
    const diff = (x: (typeof PRESETS)[number], y: (typeof PRESETS)[number]) =>
      keys.filter((k) => JSON.stringify(x.config[k]) !== JSON.stringify(y.config[k]));
    for (let i = 0; i < PRESETS.length; i++)
      for (let j = i + 1; j < PRESETS.length; j++)
        expect(diff(PRESETS[i], PRESETS[j]).length, `${PRESETS[i].id} vs ${PRESETS[j].id}`).toBeGreaterThanOrEqual(3);
  });
  it("covers each audience: general, tech, senior, entry-level, academic, dense, minimal", () => {
    const tags = PRESETS.flatMap((p) => p.tags).join(" ");
    for (const t of ["Tech", "Senior", "Entry level", "Research", "Dense", "Simple"]) expect(tags).toContain(t);
    expect(PRESETS.length).toBeGreaterThanOrEqual(8);
  });
  it("ship with no guard warnings", () => {
    for (const p of PRESETS) expect(guardConfig(p.config), p.id).toEqual([]);
  });
  it("have unique ids and presetById falls back safely", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(presetById("nope").id).toBe(PRESETS[0].id);
  });
});

describe("config validation", () => {
  it("rejects out-of-range, unknown and duplicate-section configs", () => {
    const bad = (o: object) => templateConfigSchema.safeParse({ ...DEFAULT_CONFIG, ...o }).success;
    expect(bad({ sizePt: 40 })).toBe(false);
    expect(bad({ font: "comic-sans" })).toBe(false);
    expect(bad({ accent: "#ff00ff" })).toBe(false);
    expect(bad({ sectionOrder: ["summary", "summary", "skills", "experience", "projects", "education"] })).toBe(false);
    expect(bad({ extra: 1 })).toBe(false);
  });
  it("parseConfig falls back on garbage (tampered localStorage)", () => {
    expect(parseConfig({ nope: 1 })).toEqual(DEFAULT_CONFIG);
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig("<script>")).toEqual(DEFAULT_CONFIG);
    expect(parseConfig(PRESETS[1].config)).toEqual(PRESETS[1].config);
  });
});

describe("guardConfig", () => {
  it("warns on unreadable or risky settings", () => {
    const ids = (o: object) => guardConfig({ ...DEFAULT_CONFIG, ...o }).map((w) => w.id);
    expect(ids({ sizePt: 9 })).toContain("size-small");
    expect(ids({ sizePt: 13 })).toContain("size-large");
    expect(ids({ marginIn: 0.3 })).toContain("margin-small");
    expect(ids({ lineHeight: 1.1 })).toContain("line-tight");
    expect(ids({ sectionOrder: ["summary", "skills", "education", "projects", "experience", "certifications"] })).toContain("exp-late");
  });
});

describe("accent palette", () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  it("every accent has at least 7:1 contrast on white (AAA, survives grayscale printing)", () => {
    for (const [name, hex] of Object.entries(ACCENTS)) expect((1.05) / (lum(hex) + 0.05), name).toBeGreaterThanOrEqual(7);
  });
});

describe("unit conversion", () => {
  it("11pt on Letter is 1.797cqw and Letter page height is 129.4cqw", () => {
    expect(ptToCqw(11, "letter")).toBeCloseTo(1.797, 2);
    expect(pageHeightCqw("letter")).toBeCloseTo(129.41, 1);
    expect(pageHeightCqw("a4")).toBeCloseTo(141.42, 1);
    expect(inToCqw(0.85, "letter")).toBeCloseTo(10, 1);
  });
});

describe("exports follow the template config", () => {
  const academic = presetById("academic").config;
  const modern = presetById("modern").config;

  it("LaTeX: font family, paper, margins, bullets and section order", () => {
    const sans = renderLatex(SAMPLE_RESUME, modern);
    const serif = renderLatex(SAMPLE_RESUME, academic);
    expect(sans).toContain("\\sfdefault");
    expect(serif).not.toContain("\\sfdefault");
    expect(sans).toContain("margin=0.75in");
    expect(sans).toContain("label=--");
    expect(renderLatex(SAMPLE_RESUME, { ...DEFAULT_CONFIG, paper: "a4" })).toContain("a4paper");
    const order = renderLatex(DEMO, academic);
    expect(order.indexOf("\\section*{Education}")).toBeLessThan(order.indexOf("\\section*{Experience}"));
  });

  it("plain text: section order matches the template", () => {
    const t = renderPlainText(DEMO, academic);
    expect(t.indexOf("EDUCATION")).toBeLessThan(t.indexOf("EXPERIENCE"));
    expect(t.indexOf("EXPERIENCE")).toBeLessThan(t.indexOf("SKILLS"));
  });

  it("DOCX: honours font, section order and paper size, stays single-column", async () => {
    const buf = await renderDocx(DEMO, { ...academic, paper: "a4" });
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Times New Roman");
    expect(xml.indexOf("EDUCATION") === -1 ? xml.indexOf("Education") : xml.indexOf("EDUCATION")).toBeGreaterThan(0);
    const edu = xml.search(/Education/i);
    const exp = xml.search(/Experience/i);
    expect(edu).toBeLessThan(exp);
    expect(xml).toContain('w:w="11906"'); // A4 width in twips
    expect(xml).not.toContain("<w:tbl>");
  });
});

describe("exportFileName", () => {
  const r = (over: object) => resumeSchema.parse({ ...SAMPLE_RESUME, ...over });
  it("builds Name_Role.ext", () => {
    expect(exportFileName(SAMPLE_RESUME, "pdf")).toBe("Asha_Rao_Frontend_Engineer.pdf");
    expect(exportFileName(SAMPLE_RESUME, "pdf", "Globex Inc.")).toBe("Asha_Rao_Frontend_Engineer_Globex_Inc.pdf");
  });
  it("neutralises path traversal, separators, accents and long names", () => {
    const n = exportFileName(r({ contact: { ...SAMPLE_RESUME.contact, fullName: "../../etc/passwd\\x" } }), "pdf");
    expect(n).not.toMatch(/[\\/]|\.\./);
    expect(exportFileName(r({ contact: { ...SAMPLE_RESUME.contact, fullName: "José Müller" } }), "docx")).toMatch(/^Jose_Muller/);
    expect(exportFileName(r({ contact: { ...SAMPLE_RESUME.contact, fullName: "A".repeat(80) } }), "pdf").length).toBeLessThan(80);
  });
  it("sanitises the extension and handles empty names", () => {
    expect(exportFileName(SAMPLE_RESUME, "p/d?f")).toMatch(/\.pdf$/);
    const empty = { ...SAMPLE_RESUME, experience: [], contact: { ...SAMPLE_RESUME.contact, fullName: "", headline: "" } };
    expect(exportFileName(empty, "pdf")).toBe("Resume.pdf");
  });
});
