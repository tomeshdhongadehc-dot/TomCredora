import { describe, expect, it } from "vitest";
import { renderLatex } from "@/lib/export/latex";
import { renderDocx } from "@/lib/export/docx";
import { ACCENTS, PRESETS, splitContact, skillLabelWidthEm, tint } from "@/lib/templates";
import { SAMPLE_RESUME } from "@/lib/sample";

const cfg = (id: string) => PRESETS.find((p) => p.id === id)!.config;

describe("Scholar and Standard templates", () => {
  it("are registered and differ from every other preset in at least 3 settings", () => {
    for (const id of ["scholar", "standard"]) {
      const a = cfg(id) as unknown as Record<string, unknown>;
      for (const p of PRESETS.filter((x) => x.id !== id)) {
        const b = p.config as unknown as Record<string, unknown>;
        const diff = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).length;
        expect(diff, `${id} vs ${p.id}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("splitContact puts phone/location/email left and links right", () => {
    const s = splitContact(SAMPLE_RESUME.contact, cfg("scholar"));
    expect(s.left.length).toBeGreaterThan(0);
    expect(s.right.every((x) => /\./.test(x))).toBe(true);
  });

  it("skill label column width stays within bounds", () => {
    expect(skillLabelWidthEm(["A"])).toBe(6);
    expect(skillLabelWidthEm(["x".repeat(40)])).toBe(14);
  });

  it("LaTeX: split header uses three minipages, small-caps headings, bold dates, aligned skills", () => {
    const tex = renderLatex(SAMPLE_RESUME, cfg("scholar"));
    expect(tex.match(/\\begin\{minipage\}/g)).toHaveLength(3);
    expect(tex).toContain("\\scshape");
    expect(tex).toContain("\\newcommand{\\datefmt}[1]{\\textbf{#1}}");
    expect(tex).toContain("\\hangindent=");
    expect(tex).not.toContain("\\uppercase");
  });

  it("LaTeX: Standard keeps a centred header, one-line projects and the renamed skills heading", () => {
    const tex = renderLatex(SAMPLE_RESUME, cfg("standard"));
    expect(tex).toContain("\\begin{center}");
    expect(tex).toContain("\\section*{Technical Skills}");
    expect(tex).toContain("\\underline{");
    expect(tex).not.toContain("minipage");
  });

  it("DOCX builds for both templates", async () => {
    for (const id of ["scholar", "standard"]) {
      const buf = await renderDocx(SAMPLE_RESUME, cfg(id));
      expect(buf.byteLength).toBeGreaterThan(2000);
    }
  });
});

describe("band and shaded-heading designs", () => {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it("white text on every accent band, and black text on every accent tint, keep at least 4.5:1", () => {
    for (const [name, hex] of Object.entries(ACCENTS)) {
      expect(ratio("#ffffff", hex), `white on ${name}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio("#000000", tint(hex)), `black on tint of ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("tint mixes towards white and stays a valid hex", () => {
    expect(tint("#000000")).toBe("#e0e0e0");
    expect(tint("#1f3a5f")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("LaTeX draws the band and shaded headings with colour boxes, and the text stays in order", () => {
    const tex = renderLatex(SAMPLE_RESUME, cfg("horizon"));
    expect(tex).toContain("\\newcommand{\\sectionshade}");
    expect(tex).toContain("\\color{white}");
    expect(tex.indexOf("Asha Rao")).toBeLessThan(tex.indexOf("\\section*{SUMMARY}"));
    expect(renderLatex(SAMPLE_RESUME, cfg("classic"))).not.toContain("colorbox");
  });

  it("DOCX builds for Horizon, Tint and Atlas", async () => {
    for (const id of ["horizon", "tint", "atlas"]) expect((await renderDocx(SAMPLE_RESUME, cfg(id))).byteLength).toBeGreaterThan(2000);
  });
});
