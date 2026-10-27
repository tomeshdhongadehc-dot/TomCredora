import { keywordCoverage, stuffedTerms, type Keyword } from "./keywords";
import type { Resume } from "./schema";

export interface AtsCheck {
  id: string;
  label: string;
  pass: boolean;
  hint?: string;
  weight: number;
}

export interface AtsReport {
  /** Heuristic 0-100: compatibility checks + keyword coverage. Not a guarantee. */
  score: number;
  coverage: ReturnType<typeof keywordCoverage>;
  checks: AtsCheck[];
}

const DATE_RE = /^(?:(?:0?[1-9]|1[0-2])\/\d{4}|[A-Z][a-z]{2,8} \d{4}|\d{4}-(?:0[1-9]|1[0-2])|\d{4}|Present)$/;
const FILLER = /\b(responsible for|worked on|various|etc\.?|helped with|results-driven|passionate)\b/i;
const FIRST_PERSON = /\b(I|my|me)\b/;

const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function scoreResume(resume: Resume, keywords: Keyword[]): AtsReport {
  const coverage = keywordCoverage(resume, keywords);
  const bullets = [...resume.experience.flatMap((e) => e.bullets), ...resume.projects.flatMap((p) => p.bullets)];
  const dates = resume.experience.flatMap((e) => [e.start, e.end]).filter(Boolean);

  const checks: AtsCheck[] = [
    { id: "contact", label: "Email and name present", pass: !!resume.contact.email && !!resume.contact.fullName, weight: 8 },
    { id: "phone", label: "Phone number present", pass: !!resume.contact.phone, hint: "Recruiters expect a phone number.", weight: 4 },
    { id: "summary", label: "Summary is 1-3 lines (max 45 words)", pass: !!resume.summary && wc(resume.summary) <= 45, hint: "Tighten the summary to 45 words or fewer.", weight: 6 },
    { id: "skills", label: "Skills section present", pass: resume.skills.some((g) => g.items.length), weight: 8 },
    { id: "experience", label: "Experience section present", pass: resume.experience.length > 0, weight: 10 },
    { id: "education", label: "Education section present", pass: resume.education.length > 0, weight: 5 },
    {
      id: "bullet-len",
      label: "Bullets are 8-25 words",
      pass: bullets.length > 0 && bullets.every((b) => wc(b) >= 8 && wc(b) <= 25),
      hint: "Keep each bullet to one or two lines (8-25 words).",
      weight: 8,
    },
    {
      id: "bullet-count",
      label: "3-6 bullets per role",
      pass: resume.experience.every((e) => e.bullets.length >= 3 && e.bullets.length <= 6),
      weight: 5,
    },
    { id: "metrics", label: "Most bullets contain a number", pass: bullets.length > 0 && bullets.filter((b) => /\d/.test(b)).length / bullets.length >= 0.5, hint: "Quantify impact (%, $, time, scale) where you truthfully can.", weight: 8 },
    { id: "dates", label: "Dates use a consistent, parseable format", pass: dates.every((d) => DATE_RE.test(d)), hint: 'Use "Jan 2023", "01/2023" or "2023-01".', weight: 7 },
    { id: "filler", label: "No filler or cliche phrases", pass: !bullets.concat(resume.summary).some((b) => FILLER.test(b)), hint: "Remove 'responsible for', 'worked on', 'results-driven'.", weight: 5 },
    { id: "person", label: "No first-person pronouns", pass: !bullets.concat(resume.summary).some((b) => FIRST_PERSON.test(b)), weight: 4 },
    { id: "stuffing", label: "No keyword stuffing", pass: stuffedTerms(resume, keywords).length === 0, hint: "A term appears too often.", weight: 4 },
  ];

  const checkMax = checks.reduce((n, c) => n + c.weight, 0);
  const checkGot = checks.reduce((n, c) => n + (c.pass ? c.weight : 0), 0);
  // 40% structural checks, 60% keyword coverage (when a JD is provided)
  const score = keywords.length
    ? Math.round((checkGot / checkMax) * 40 + (coverage.pct / 100) * 60)
    : Math.round((checkGot / checkMax) * 100);

  return { score, coverage, checks };
}
