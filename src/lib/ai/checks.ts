import { resumeToPlainText } from "@/lib/keywords";
import { checkEmbellishment } from "./embellishment";
import type { Resume } from "@/lib/schema";
import type { TailorOutput } from "./prompts/v2/tailor";

export type Severity = "error" | "warn";
export interface Issue {
  severity: Severity;
  code: "ungrounded-number" | "ungrounded-term" | "unknown-id" | "bad-source" | "style" | "leak" | "keyword-claim" | "embellishment";
  where: string; // e.g. "experience[e1].bullets[2]"
  message: string;
}

const KNOWN_TECH = [
  "react", "typescript", "javascript", "python", "java", "golang", "rust", "sql", "postgresql", "mysql", "mongodb",
  "redis", "graphql", "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "git", "linux", "tableau",
  "power bi", "excel", "figma", "tailwind", "spark", "pandas", "tensorflow", "pytorch", "salesforce", "jira",
  "next.js", "node.js", "ci/cd", "c++", "c#",
];

/**
 * Canonical form used before EVERY comparison, so encoding tricks cannot smuggle facts past the checks:
 * NFKC (fullwidth/superscript forms), invisible characters removed, any Unicode digit -> ASCII.
 */
export function canon(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[​-‏‪-‮⁠-⁤﻿­]/g, "")
    .replace(/ /g, " ")
    .replace(/\p{Nd}/gu, (d) => {
      // Nd blocks are runs of 10 consecutive code points starting at the zero digit.
      let cp = d.codePointAt(0)!;
      let start = cp;
      while (/\p{Nd}/u.test(String.fromCodePoint(start - 1))) start--;
      cp -= start;
      return String(cp % 10);
    });
}

const norm = (s: string) => canon(s).toLowerCase().replace(/[^a-z0-9+#./%\s-]/g, " ").replace(/\s+/g, " ").trim();
const has = (hay: string, needle: string) => {
  const esc = needle.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`).test(hay);
};
/** Numbers as written: 12,000 / 38% / 2.5 / $4M -> digit groups only. */
const numbers = (s: string) => (canon(s).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));

const BANNED = /\b(responsible for|worked on|helped|various|etc\.?|results-driven|passionate|team player|hard-working|proven track record|detail-oriented|go-getter|dynamic professional|self-starter|synergy)\b/i;
const FIRST_PERSON = /\b(I|my|me)\b/;
const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;

export interface CheckInput {
  profile: Resume;
  output: TailorOutput;
  jdKeywords: string[];
}

/**
 * Deterministic verification of model output against the user's own data.
 * Errors mean the text must be dropped/flagged; warns are shown as coaching.
 */
export function verifyTailorOutput({ profile, output, jdKeywords }: CheckInput): Issue[] {
  const issues: Issue[] = [];
  const profileText = norm(resumeToPlainText(profile) + "\n" + profile.experience.map((e) => `${e.start} ${e.end}`).join(" "));
  // Numbers come from the raw text: norm() would split "12,000" into "12" and "000".
  const rawProfile = resumeToPlainText(profile) + "\n" + profile.experience.map((e) => `${e.start} ${e.end}`).join(" ");
  const profileNums = new Set(numbers(rawProfile));
  const byId = new Map(profile.experience.map((e) => [e.id, e]));

  const groundText = (text: string, where: string) => {
    for (const n of numbers(text)) {
      if (!profileNums.has(n))
        issues.push({ severity: "error", code: "ungrounded-number", where, message: `Number "${n}" is not in your profile.` });
    }
    const t = norm(text);
    for (const term of KNOWN_TECH) {
      if (has(t, term) && !has(profileText, term))
        issues.push({ severity: "error", code: "ungrounded-term", where, message: `"${term}" is not in your profile.` });
    }
  };

  groundText(output.summary, "summary");
  if (FIRST_PERSON.test(output.summary) || BANNED.test(output.summary))
    issues.push({ severity: "warn", code: "style", where: "summary", message: "Summary contains filler or first person." });
  if (wc(output.summary) > 45)
    issues.push({ severity: "warn", code: "style", where: "summary", message: "Summary is over 45 words." });

  for (const g of output.skills) {
    for (const item of g.items) {
      if (!has(profileText, norm(item)) )
        issues.push({ severity: "error", code: "ungrounded-term", where: `skills[${g.label}]`, message: `Skill "${item}" is not in your profile.` });
    }
  }

  for (const role of output.experience) {
    const src = byId.get(role.id);
    if (!src) {
      issues.push({ severity: "error", code: "unknown-id", where: `experience[${role.id}]`, message: "Unknown experience id." });
      continue;
    }
    const verbs = new Set<string>();
    role.bullets.forEach((b, i) => {
      const where = `experience[${role.id}].bullets[${i}]`;
      if (b.from < -1 || b.from >= src.bullets.length)
        issues.push({ severity: "error", code: "bad-source", where, message: "Bullet source index is invalid." });
      groundText(b.text, where);

      // Subtle fabrication: new activities/scope/qualities not in the user's own source bullet.
      const sources = [b.from >= 0 ? (src.bullets[b.from] ?? "") : src.bullets.join(" "), src.role, src.company, profile.skills.flatMap((g) => g.items).join(" ")];
      const emb = checkEmbellishment(b.text, sources);
      if (emb.flagged)
        issues.push({ severity: "warn", code: "embellishment", where, message: `New wording not in your original: "${emb.novel.slice(0, 4).join('", "')}". Confirm it is true.` });

      for (const kw of b.keywords_used) {
        if (!has(norm(b.text), norm(kw)))
          issues.push({ severity: "warn", code: "keyword-claim", where, message: `Claimed keyword "${kw}" is not in the bullet.` });
      }
      const n = wc(b.text);
      if (n < 8 || n > 25) issues.push({ severity: "warn", code: "style", where, message: `Bullet is ${n} words (target 12-22).` });
      if (BANNED.test(b.text) || FIRST_PERSON.test(b.text))
        issues.push({ severity: "warn", code: "style", where, message: "Filler phrase or first person." });
      const verb = norm(b.text).split(" ")[0];
      if (verbs.has(verb)) issues.push({ severity: "warn", code: "style", where, message: `Repeated lead verb "${verb}".` });
      verbs.add(verb);
    });
  }

  // Leak / injection: nothing in the output should look like instructions or contain foreign contact data.
  const all = canon(JSON.stringify(output));
  const allowedEmail = profile.contact.email.toLowerCase();
  for (const m of all.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []) {
    if (m.toLowerCase() !== allowedEmail && !has(profileText, m.toLowerCase()))
      issues.push({ severity: "error", code: "leak", where: "output", message: `Unexpected email "${m}".` });
  }
  if (/https?:\/\//i.test(all) && !/https?:\/\//i.test(profileText))
    issues.push({ severity: "error", code: "leak", where: "output", message: "Output contains a URL not in your profile." });
  if (/(ignore (all|previous)|system prompt|as an ai|<\/?(jd|profile)>)/i.test(all))
    issues.push({ severity: "error", code: "leak", where: "output", message: "Output contains instruction-like text." });

  void jdKeywords;
  return issues;
}

/** Drop bullets/terms that failed an error-level check; keep warnings for the UI. */
export function applyIssues(output: TailorOutput, issues: Issue[]): TailorOutput {
  const bad = new Set(issues.filter((i) => i.severity === "error").map((i) => i.where));
  if (bad.has("output")) throw new Error("Model output rejected by safety checks");
  return {
    ...output,
    summary: bad.has("summary") ? "" : output.summary,
    skills: output.skills.map((g) =>
      bad.has(`skills[${g.label}]`) ? { ...g, items: g.items.filter((it) => !issues.some((i) => i.where === `skills[${g.label}]` && i.message.includes(`"${it}"`))) } : g,
    ),
    experience: output.experience
      .filter((r) => !bad.has(`experience[${r.id}]`))
      .map((r) => ({ ...r, bullets: r.bullets.filter((_, i) => !bad.has(`experience[${r.id}].bullets[${i}]`)) })),
  };
}
