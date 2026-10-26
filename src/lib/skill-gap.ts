import { FAMILIES } from "./catalog";
import { KNOWN, countOccurrences, norm, resumeToPlainText } from "./keywords";
import type { Resume } from "./schema";

/**
 * The skills a job description asks for, compared with what the user actually has.
 *
 * Honesty rule: a skill the user does not have is NEVER added for them. It is listed so they can tap "I have this"
 * if it is true. Skills they do have (anywhere in their profile text) are lifted to the front of the skills list
 * in the job's own wording, which is what keyword filters match.
 */

/** Different ways people write the same skill (lower case). The first entry of each pair is the display form. */
const ALIASES: Record<string, string[]> = {
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  kubernetes: ["k8s"],
  "node.js": ["nodejs", "node js"],
  postgresql: ["postgres"],
  "ci/cd": ["cicd", "ci cd"],
  "machine learning": ["ml"],
  "power bi": ["powerbi"],
  react: ["reactjs", "react.js"],
  "next.js": ["nextjs"],
  "vue.js": ["vuejs"],
  "c#": ["csharp"],
  ".net": ["dotnet"],
  "google analytics": ["ga4"],
  "search engine optimization": ["seo"],
};

/** Words that are also skills but far more often ordinary English; they are matched only in a skill-like context. */
const NEGATIVE: Record<string, RegExp> = {
  excel: /(?<![a-z0-9])excel\s+(in|at|as|to|under)\b/g,
};
/** Single letters / tiny words that would match everywhere ("go to market", "R&D"). Not detected from free text. */
const AMBIGUOUS = new Set(["go", "r", "c"]);

/** lower-case skill -> how to show it. Catalog spelling wins; the generic keyword list fills the rest. */
const DISPLAY = new Map<string, string>();
for (const f of FAMILIES) for (const g of f.skills) if (g.label !== "Soft skills") for (const s of g.items) DISPLAY.set(s.toLowerCase(), s);
const pretty = (t: string) => (t.length <= 4 || /[./#+]/.test(t) ? t.toUpperCase().replace(/\.JS$/, ".js") : t.replace(/\b[a-z]/g, (c) => c.toUpperCase()));
for (const k of KNOWN) if (!DISPLAY.has(k)) DISPLAY.set(k, pretty(k));

const forms = (term: string) => [term, ...(ALIASES[term] ?? [])];

function present(hay: string, term: string): boolean {
  return forms(term).some((f) => {
    const n = norm(f);
    if (!n) return false;
    const neg = NEGATIVE[f];
    const bad = neg ? (hay.match(neg) ?? []).length : 0;
    return countOccurrences(hay, n) - bad > 0;
  });
}

/** Skills named in a job description, as people write them (catalog spelling), most-mentioned first. */
export function jdSkills(jd: string): string[] {
  const hay = norm(jd);
  const found: [string, number][] = [];
  for (const term of DISPLAY.keys()) {
    if (AMBIGUOUS.has(term)) continue;
    let n = 0;
    for (const f of forms(term)) {
      const m = countOccurrences(hay, norm(f));
      n += m - (NEGATIVE[f] ? (hay.match(NEGATIVE[f]) ?? []).length : 0);
    }
    if (n > 0) found.push([term, n]);
  }
  // a longer skill swallows the shorter one it contains ("power bi" over "power")
  const terms = found.map(([t]) => t);
  return found
    .filter(([t]) => !terms.some((o) => o !== t && o.includes(t) && o.length > t.length && countOccurrences(hay, norm(o)) >= countOccurrences(hay, norm(t))))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => DISPLAY.get(t)!);
}

export interface SkillGap {
  /** the job wants it and it is somewhere in the user's profile (skills, jobs, projects...) */
  have: string[];
  /** the job wants it and nothing in the profile mentions it: the user must confirm before it is used */
  missing: string[];
}

export function skillGap(jd: string, r: Resume): SkillGap {
  const hay = norm(resumeToPlainText(r));
  const have: string[] = [];
  const missing: string[] = [];
  for (const s of jdSkills(jd)) (present(hay, s.toLowerCase()) ? have : missing).push(s);
  return { have, missing };
}

/** Is this text a skill we recognise (so a "missing keyword" can be offered as a one-tap "I have this")? */
export const isKnownSkill = (term: string) => DISPLAY.has(term.toLowerCase());
export const skillDisplay = (term: string) => DISPLAY.get(term.toLowerCase()) ?? term;

export const OTHER_SKILLS = "Other skills";
const MAX_ITEMS = 25;
const MAX_GROUPS = 8;

/** Add one skill the user has confirmed, to the group it belongs to (or "Other skills"). Never duplicates. */
export function addSkill(r: Resume, skill: string): Resume {
  const lower = skill.toLowerCase();
  const same = new Set(forms(lower));
  if (r.skills.some((g) => g.items.some((i) => same.has(i.toLowerCase())))) return r;
  const home = FAMILIES.flatMap((f) => f.skills).find((g) => g.label !== "Soft skills" && g.items.some((i) => i.toLowerCase() === lower))?.label;
  const target = r.skills.find((g) => g.label === home && g.items.length < MAX_ITEMS) ?? r.skills.find((g) => g.label === OTHER_SKILLS && g.items.length < MAX_ITEMS);
  if (target) return { ...r, skills: r.skills.map((g) => (g === target ? { ...g, items: [...g.items, skill] } : g)) };
  if (r.skills.length >= MAX_GROUPS) return r;
  return { ...r, skills: [...r.skills, { label: home ?? OTHER_SKILLS, items: [skill] }] };
}

/** Take a skill back out (used when the user un-taps one). */
export function removeSkill(r: Resume, skill: string): Resume {
  const lower = skill.toLowerCase();
  return { ...r, skills: r.skills.map((g) => ({ ...g, items: g.items.filter((i) => i.toLowerCase() !== lower) })).filter((g) => g.items.length) };
}

/**
 * Make the skills section match the job without inventing anything:
 *  - skills the user has that the job also wants go first within their group;
 *  - a wanted skill that is in the user's resume text (a job, a project) but missing from the skills list is added to it.
 */
export function alignSkillsToJd(r: Resume, jd: string): Resume {
  const wanted = jdSkills(jd);
  if (!wanted.length) return r;
  const hay = norm(resumeToPlainText(r));
  /** The job's spelling of an item when it is the same skill ("JS" -> "JavaScript"), else the item as it was. */
  const inJobWords = (item: string) => {
    const l = item.toLowerCase();
    return wanted.find((w) => w.toLowerCase() === l || (ALIASES[w.toLowerCase()] ?? []).includes(l)) ?? item;
  };
  const isWanted = (item: string) => inJobWords(item) !== item || wanted.some((w) => w.toLowerCase() === item.toLowerCase());
  let out: Resume = {
    ...r,
    skills: r.skills.map((g) => {
      const items = [...new Set(g.items.map(inJobWords))];
      return { ...g, items: [...items.filter(isWanted), ...items.filter((i) => !isWanted(i))] };
    }),
  };
  for (const w of wanted) if (present(hay, w.toLowerCase())) out = addSkill(out, w);
  return out;
}
