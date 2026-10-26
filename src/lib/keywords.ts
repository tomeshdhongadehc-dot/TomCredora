import type { Resume } from "./schema";

export interface Keyword {
  term: string; // as written in the JD (display form)
  weight: number; // higher = more important
}

const STOP = new Set(
  (
    "a an the and or but if of to in on for with at by from as is are was were be been being this that these those " +
    "it its we you your our they their will can may should must shall have has had do does did not no than then " +
    "also such into over under about across per via within without including etc ability able strong good great " +
    "experience years year work working team teams role job position company candidate looking join responsibilities " +
    "requirements required preferred plus knowledge understanding excellent skills skill using use used new more most " +
    "other all any each both who what which when where how why while up out off one two three"
  ).split(" "),
);

// Terms worth keeping verbatim (multi-word / symbol-bearing tech terms ATS filters commonly match).
export const KNOWN = [
  "node.js", "next.js", "react", "typescript", "javascript", "python", "java", "c++", "c#", "golang", "rust",
  "sql", "postgresql", "mysql", "mongodb", "redis", "graphql", "rest api", "aws", "azure", "gcp", "docker",
  "kubernetes", "terraform", "ci/cd", "git", "linux", "machine learning", "data analysis", "project management",
  "agile", "scrum", "tableau", "power bi", "excel", "figma", "tailwind", "html", "css", "microservices",
  "unit testing", "tdd", "devops", "etl", "spark", "pandas", "tensorflow", "pytorch", "llm", "seo",
  "stakeholder management", "product management", "a/b testing", "salesforce", "jira",
];

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#./\s-]/g, " ").replace(/\s+/g, " ").trim();

export function countOccurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  const esc = needle.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  // word-ish boundary that tolerates symbols like c++ / node.js
  const re = new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, "g");
  return (hay.match(re) ?? []).length;
}

/** Deterministic top-N keyword extraction from a JD. No network, no AI. */
export function extractKeywords(jd: string, limit = 25): Keyword[] {
  const text = norm(jd);
  const scores = new Map<string, number>();

  for (const k of KNOWN) {
    const n = countOccurrences(text, k);
    if (n > 0) scores.set(k, 3 + n); // known tech terms get a head start
  }

  const tokens = text.split(" ").filter(Boolean);
  const isWord = (t: string) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t);

  // unigrams + bigrams made of non-stopwords
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    if (!isWord(a)) continue;
    scores.set(a, (scores.get(a) ?? 0) + 1);
    const b = tokens[i + 1];
    if (b && isWord(b)) {
      const bi = `${a} ${b}`;
      scores.set(bi, (scores.get(bi) ?? 0) + 1.5);
    }
  }

  const ranked = [...scores.entries()]
    // bigrams/unigrams seen once are noise unless they are known terms
    .filter(([t, s]) => s >= 3 || KNOWN.includes(t))
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));

  // drop unigrams already covered by a kept bigram/known multi-word term
  const out: Keyword[] = [];
  for (const [term, weight] of ranked) {
    if (out.some((k) => k.term !== term && k.term.includes(term) && k.weight >= weight)) continue;
    out.push({ term, weight });
    if (out.length >= limit) break;
  }
  return out;
}

export function resumeToPlainText(r: Resume): string {
  const parts: string[] = [
    r.contact.fullName,
    r.contact.headline,
    r.summary,
    ...r.skills.flatMap((g) => [g.label, ...g.items]),
    ...r.experience.flatMap((e) => [e.role, e.company, ...e.bullets]),
    ...r.projects.flatMap((p) => [p.name, ...p.tech, ...p.bullets]),
    ...r.education.flatMap((e) => [e.school, e.degree, e.details]),
    ...r.certifications,
  ];
  return parts.filter(Boolean).join("\n");
}

export interface Coverage {
  matched: string[];
  missing: string[];
  pct: number;
}

/** Weighted keyword coverage computed locally (never trust the model's claim). */
export function keywordCoverage(resume: Resume, keywords: Keyword[]): Coverage {
  const hay = norm(resumeToPlainText(resume));
  const matched: string[] = [];
  const missing: string[] = [];
  let got = 0;
  let total = 0;
  for (const k of keywords) {
    total += k.weight;
    if (countOccurrences(hay, norm(k.term)) > 0) {
      matched.push(k.term);
      got += k.weight;
    } else missing.push(k.term);
  }
  return { matched, missing, pct: total ? Math.round((got / total) * 100) : 0 };
}

/** Terms repeated suspiciously often (keyword stuffing). */
export function stuffedTerms(resume: Resume, keywords: Keyword[], max = 4): string[] {
  const hay = norm(resumeToPlainText(resume));
  return keywords.filter((k) => countOccurrences(hay, norm(k.term)) > max).map((k) => k.term);
}
