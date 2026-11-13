import { extractKeywords, norm } from "./keywords";
import type { Resume } from "./schema";
import { PAPER, type TemplateConfig } from "./templates";

/**
 * Fitting a resume to a page count. Two levers, gentlest first: tighten the layout a little (font, margins, line
 * spacing: nothing is lost), then take out the points that matter least for THIS job. Nothing is invented and the
 * person sees exactly what changed and can undo it. Pure functions: measuring the page happens in the browser.
 */

/** How many pages the content takes, from measurements in pixels. A sliver under half a pixel of overflow is ignored. */
export function pagesFor(scrollHeight: number, width: number, config: Pick<TemplateConfig, "paper" | "marginIn">): { pages: number; contentPx: number; usablePx: number } {
  const p = PAPER[config.paper];
  const scale = width / p.widthIn; // pixels per inch at this width
  const pad = config.marginIn * scale;
  const usablePx = p.heightIn * scale - 2 * pad;
  const contentPx = Math.max(0, scrollHeight - 2 * pad);
  return { pages: Math.max(1, Math.ceil((contentPx - 0.5) / usablePx)), contentPx, usablePx };
}

/** "about 3 lines over" for a page count target, or 0 when it already fits. */
export function linesOver(scrollHeight: number, width: number, config: Pick<TemplateConfig, "paper" | "marginIn" | "sizePt" | "lineHeight">, target: number): number {
  const { contentPx, usablePx } = pagesFor(scrollHeight, width, config);
  const over = contentPx - usablePx * target;
  if (over <= 0.5) return 0;
  const pxPerInch = width / PAPER[config.paper].widthIn;
  const linePx = (config.sizePt / 72) * pxPerInch * config.lineHeight; // points -> inches -> pixels, times line spacing
  return Math.max(1, Math.ceil(over / linePx));
}

export interface Cut {
  /** "role" or "project" */
  kind: "role" | "project";
  id: string;
  text: string;
  /** shown to the person: "Frontend Developer at Globex" */
  where: string;
  /** how well this point matches the job (lower is cut first) */
  score: number;
}

/**
 * The points that can be removed, least useful for the job first. Kept no matter what: each job's first point,
 * and the two best points of the most recent job (so the resume never loses its heart).
 */
export function rankCuts(resume: Resume, jd: string): Cut[] {
  const keywords = extractKeywords(jd, 40);
  const score = (text: string) => {
    const n = ` ${norm(text)} `;
    let s = 0;
    for (const k of keywords) if (n.includes(` ${k.term} `) || n.includes(k.term)) s += k.weight;
    if (/\d/.test(text)) s += 1.5; // a number is the best evidence a point has
    return s;
  };
  const cuts: Cut[] = [];
  resume.experience.forEach((e, ri) => {
    const where = [e.role, e.company].filter(Boolean).join(" at ") || "a job";
    const ranked = e.bullets.map((b, i) => ({ b, i, s: score(b) - ri * 0.6 - i * 0.15 })).sort((a, b) => b.s - a.s);
    const keep = new Set(ranked.slice(0, ri === 0 ? 2 : 1).map((x) => x.i));
    for (const x of ranked) if (!keep.has(x.i)) cuts.push({ kind: "role", id: e.id, text: x.b, where, score: x.s });
  });
  resume.projects.forEach((p, pi) => {
    const where = p.name || "a project";
    const ranked = p.bullets.map((b, i) => ({ b, i, s: score(b) - 1 - pi * 0.3 - i * 0.15 })).sort((a, b) => b.s - a.s);
    for (const x of ranked.slice(1)) cuts.push({ kind: "project", id: p.id, text: x.b, where, score: x.s });
  });
  return cuts.sort((a, b) => a.score - b.score);
}

/** The resume without the given points. */
export function applyCuts(resume: Resume, cuts: Cut[]): Resume {
  if (!cuts.length) return resume;
  const drop = (kind: Cut["kind"], id: string) => new Set(cuts.filter((c) => c.kind === kind && c.id === id).map((c) => c.text));
  return {
    ...resume,
    experience: resume.experience.map((e) => {
      const d = drop("role", e.id);
      return d.size ? { ...e, bullets: e.bullets.filter((b) => !d.has(b)) } : e;
    }),
    projects: resume.projects.map((p) => {
      const d = drop("project", p.id);
      return d.size ? { ...p, bullets: p.bullets.filter((b) => !d.has(b)) } : p;
    }),
  };
}

export interface Tighten {
  label: string;
  config: TemplateConfig;
}

/** Up to three gentle layout steps, each a little tighter than the last. Never below readable sizes. */
export function tightenSteps(c: TemplateConfig): Tighten[] {
  const steps: Tighten[] = [];
  let cur = c;
  const push = (label: string, next: TemplateConfig) => {
    if (JSON.stringify(next) !== JSON.stringify(cur)) {
      steps.push({ label, config: next });
      cur = next;
    }
  };
  push("tighter spacing between sections", { ...cur, sectionGap: cur.sectionGap === "airy" ? "normal" : "tight" });
  push("slightly smaller margins", { ...cur, marginIn: Math.max(0.5, Math.round((cur.marginIn - 0.1) * 100) / 100), lineHeight: Math.max(1.15, Math.round((cur.lineHeight - 0.05) * 100) / 100) });
  push("a slightly smaller font", { ...cur, sizePt: Math.max(10, Math.round((cur.sizePt - 0.5) * 2) / 2) });
  return steps;
}
