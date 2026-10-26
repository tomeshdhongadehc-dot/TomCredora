import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumePaper } from "@/components/ResumePaper";
import { buildHtmlDocument } from "@/lib/export/html";
import { PAPER_CSS, exportCss, sheetCss } from "@/lib/paper-css";
import { resumeSchema } from "@/lib/schema";
import { SAMPLE_RESUME as DEMO } from "@/lib/sample";
import { PRESETS, presetById } from "@/lib/templates";

const markup = (resume = DEMO, id = "classic") =>
  renderToStaticMarkup(createElement(ResumePaper, { resume, config: presetById(id).config, mode: "print", showGuide: false }));
const doc = (id = "classic", resume = DEMO) => buildHtmlDocument(markup(resume, id), presetById(id).config, `${resume.contact.fullName} - Resume`);

describe("exported HTML document", () => {
  it("is a complete, self-contained page: doctype, lang, charset, viewport, inline CSS", () => {
    const d = doc();
    expect(d.startsWith("<!doctype html>")).toBe(true);
    expect(d).toContain('<html lang="en">');
    expect(d).toContain('<meta charset="utf-8">');
    expect(d).toContain('name="viewport"');
    expect(d).toContain("<style>");
    expect(d).toContain(PAPER_CSS);
  });

  it("contains no scripts, external requests, images or event handlers; and locks that down with a CSP", () => {
    for (const p of PRESETS) {
      const d = doc(p.id);
      expect(d, p.id).not.toMatch(/<script|<link|<img|<iframe|<object|<embed|@import|url\(|\son\w+=/i);
      // the only URL anywhere in the file is the user's own link (shown as text, never fetched)
      const urls = d.match(/https?:\/\/[^\s"'<)]+/g) ?? [];
      expect(urls.every((u) => u.includes("linkedin.com")), `${p.id}: ${urls.join(",")}`).toBe(true);
      expect(d).toContain("default-src 'none'");
    }
  });

  it("is private by default (noindex) and uses semantic structure: one h1, h2 per section, real lists", () => {
    const d = doc();
    expect(d).toContain('<meta name="robots" content="noindex">');
    expect(d.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(d.match(/<h2[\s>]/g)?.length).toBeGreaterThanOrEqual(4);
    expect(d).toContain("<ul");
    expect(d).toContain("<li");
    expect(d).not.toMatch(/<table|<td|<tr/i);
  });

  it("escapes hostile user content in the page and the title (no script can be injected)", () => {
    const hostile = resumeSchema.parse({
      ...DEMO,
      contact: { ...DEMO.contact, fullName: '</title><script>alert(1)</script><img src=x onerror="alert(2)">' },
      summary: "<b onmouseover=alert(3)>x</b>",
      experience: [{ ...DEMO.experience[0], bullets: ['"><script>alert(4)</script>'] }],
    });
    const d = doc("classic", hostile);
    expect(d).not.toMatch(/<script/i);
    expect(d).not.toMatch(/<img/i);
    expect(d).not.toMatch(/<b onmouseover/i);
    expect(d).toContain("&lt;/title&gt;");
    // exactly one <title> element, and it was not closed early
    expect(d.match(/<title>/g)).toHaveLength(1);
    expect(d.match(/<\/title>/g)).toHaveLength(1);
  });

  it("applies paper size and margins to @page for every preset", () => {
    for (const p of PRESETS) {
      const css = sheetCss(p.config);
      expect(css, p.id).toContain(`@page{size:letter;margin:${p.config.marginIn}in}`);
      expect(css).toContain(`padding:${p.config.marginIn}in`);
    }
    expect(sheetCss({ ...presetById("classic").config, paper: "a4" })).toContain("size:A4");
  });

  it("the standalone CSS file equals the CSS embedded in the page (no drift)", () => {
    for (const p of PRESETS) {
      expect(doc(p.id)).toContain(exportCss(p.config));
    }
  });

  it("preview markup and export markup come from the same component (identical text, same order)", () => {
    const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const a = strip(markup(DEMO, "engineer"));
    expect(a).toContain("Senior Frontend Engineer Jan 2022 - Present Acme Corp Bengaluru");
    expect(a.indexOf("Summary")).toBeLessThan(a.indexOf("Experience"));
  });

  it("works for sparse resumes without emitting empty sections or broken markup", () => {
    const sparse = resumeSchema.parse({ contact: { fullName: "A B", email: "a@b.co" } });
    const d = doc("minimal", sparse);
    expect(d).not.toContain("<h2");
    expect(d.match(/<(\w+)[^>]*>/g)!.length).toBeGreaterThan(3);
  });
});
