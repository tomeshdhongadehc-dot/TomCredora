import { describe, expect, it } from "vitest";
import { applyCuts, linesOver, pagesFor, rankCuts, tightenSteps } from "@/lib/fit";
import { SAMPLE_RESUME } from "@/lib/sample";
import { DEFAULT_CONFIG, presetById } from "@/lib/templates";

const cfg = { paper: "letter" as const, marginIn: 0.65 };

describe("counting pages from measurements", () => {
  // 800px wide letter page: 94.1 px per inch, page 1035px tall, margins 61px each side
  it("a page that is not full is one page", () => {
    expect(pagesFor(1035, 800, cfg).pages).toBe(1);
    expect(pagesFor(400, 800, cfg).pages).toBe(1);
  });
  it("counts a second page once the content passes the usable height", () => {
    const { usablePx } = pagesFor(1035, 800, cfg);
    const pad = 0.65 * (800 / 8.5);
    expect(pagesFor(usablePx + 2 * pad + 5, 800, cfg).pages).toBe(2);
    expect(pagesFor(2 * usablePx + 2 * pad - 5, 800, cfg).pages).toBe(2);
    expect(pagesFor(2 * usablePx + 2 * pad + 5, 800, cfg).pages).toBe(3);
  });
  it("ignores a sliver of rounding", () => {
    const { usablePx } = pagesFor(1035, 800, cfg);
    const pad = 0.65 * (800 / 8.5);
    expect(pagesFor(usablePx + 2 * pad + 0.3, 800, cfg).pages).toBe(1);
  });
  it("A4 is a different shape", () => {
    expect(pagesFor(1000, 800, { paper: "a4", marginIn: 0.65 }).pages).toBe(1);
  });
  it("says how many lines are over", () => {
    const c = { ...cfg, sizePt: 11, lineHeight: 1.3 };
    const { usablePx } = pagesFor(1035, 800, c);
    const pad = 0.65 * (800 / 8.5);
    expect(linesOver(usablePx + 2 * pad - 10, 800, c, 1)).toBe(0);
    const n = linesOver(usablePx + 2 * pad + 60, 800, c, 1);
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(6);
  });
});

const JD = "Senior Frontend Engineer React TypeScript Next.js GraphQL AWS Docker CI/CD";

describe("which points to cut first", () => {
  const cuts = rankCuts(SAMPLE_RESUME, JD);
  it("never offers a job's best point, and keeps two for the newest job", () => {
    const first = SAMPLE_RESUME.experience[0];
    const offered = cuts.filter((c) => c.id === first.id).length;
    expect(offered).toBe(Math.max(0, first.bullets.length - 2));
    for (const e of SAMPLE_RESUME.experience) expect(cuts.filter((c) => c.id === e.id).length).toBeLessThan(e.bullets.length);
  });
  it("cuts the points that match the job least before the ones that match it", () => {
    const resume = {
      ...SAMPLE_RESUME,
      experience: [{ ...SAMPLE_RESUME.experience[0], bullets: ["Organised the office kitchen rota", "Rebuilt checkout in React and TypeScript, cutting load time by 38%", "Planned the team lunch", "Built GraphQL APIs on AWS"] }],
    };
    const c = rankCuts(resume, JD);
    expect(c[0].text).toMatch(/kitchen|lunch/);
    expect(c.map((x) => x.text)).not.toContain("Rebuilt checkout in React and TypeScript, cutting load time by 38%");
  });
  it("applying cuts removes exactly those points and changes nothing else", () => {
    const some = cuts.slice(0, 2);
    const out = applyCuts(SAMPLE_RESUME, some);
    const count = (r: typeof SAMPLE_RESUME) => r.experience.reduce((n, e) => n + e.bullets.length, 0) + r.projects.reduce((n, p) => n + p.bullets.length, 0);
    expect(count(out)).toBe(count(SAMPLE_RESUME) - 2);
    expect(out.contact).toEqual(SAMPLE_RESUME.contact);
    expect(out.skills).toEqual(SAMPLE_RESUME.skills);
    expect(applyCuts(SAMPLE_RESUME, [])).toBe(SAMPLE_RESUME);
  });
  it("is deterministic", () => {
    expect(rankCuts(SAMPLE_RESUME, JD)).toEqual(rankCuts(SAMPLE_RESUME, JD));
  });
});

describe("tightening the layout", () => {
  it("makes small steps and stays readable", () => {
    const steps = tightenSteps(presetById("executive").config);
    expect(steps.length).toBeGreaterThan(0);
    const last = steps[steps.length - 1].config;
    expect(last.sizePt).toBeGreaterThanOrEqual(10);
    expect(last.marginIn).toBeGreaterThanOrEqual(0.5);
    expect(last.lineHeight).toBeGreaterThanOrEqual(1.15);
  });
  it("offers nothing when the template is already as tight as allowed", () => {
    const tight = { ...DEFAULT_CONFIG, sectionGap: "tight" as const, marginIn: 0.5, lineHeight: 1.15, sizePt: 10 };
    expect(tightenSteps(tight)).toEqual([]);
  });
  it("each step is a valid change from the one before", () => {
    const steps = tightenSteps(presetById("minimal").config);
    let prev = presetById("minimal").config;
    for (const s of steps) {
      expect(JSON.stringify(s.config)).not.toBe(JSON.stringify(prev));
      expect(s.config.sizePt).toBeLessThanOrEqual(prev.sizePt);
      prev = s.config;
    }
  });
});
