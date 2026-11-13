import { newId } from "../ids";
import { looseResume } from "../loose";
import type { Resume } from "../schema";

/**
 * Turns the plain text of an existing resume (pasted, or pulled out of a PDF or Word file) into profile fields.
 * Pure and deterministic: no network and no AI, so the text never leaves the browser when it is pasted, and the
 * same text always gives the same result. It is a best effort. Resumes are laid out in endless ways, so the result
 * is always shown for the person to check; `notes` says what could not be understood.
 */

export interface ImportReport {
  resume: Resume;
  found: { roles: number; education: number; skills: number; projects: number; certifications: number };
  /** plain-language things to double check */
  notes: string[];
}

type SectionId = "summary" | "experience" | "education" | "skills" | "projects" | "certifications" | "other";

const HEADINGS: [SectionId, RegExp][] = [
  ["summary", /^(?:professional |career |executive )?(?:summary|profile|objective|about(?: me)?|overview)$/],
  ["experience", /^(?:(?:professional|work|relevant|industry|employment|career) )?(?:experience|history)$|^employment(?: history)?$|^internships?$|^work$/],
  ["education", /^education(?:al)?(?: background| qualifications?)?$|^academics?$|^qualifications?$|^academic background$/],
  ["skills", /^(?:(?:technical|core|key|professional|it) )?skills?(?: (?:&|and) (?:tools|technologies|interests))?$|^technologies$|^tools(?: (?:&|and) technologies)?$|^competenc(?:y|ies)$|^areas of expertise$|^expertise$|^tech stack$/],
  ["projects", /^(?:(?:personal|academic|selected|key|side|notable) )?projects?$/],
  ["certifications", /^(?:licen[cs]es? (?:&|and) )?certifications?(?: (?:&|and) (?:licen[cs]es?|courses|training))?$|^certificates?$|^licen[cs]es?$|^courses?$|^training$/],
  [
    "other",
    /^(?:awards?(?: (?:&|and) honou?rs)?|honou?rs|achievements?|languages?|interests?|hobbies|references?|publications?|volunteer(?:ing)?(?: experience)?|activities|extracurriculars?|extra[- ]curricular(?: activities)?|leadership|declaration|personal (?:details|information)|links?)$/,
  ],
];

/** Which section a line starts, if it is a heading ("EXPERIENCE", "Work Experience:", "Skills & Tools"). */
export function headingOf(line: string): SectionId | null {
  const t = line.trim().replace(/[:.\s]+$/, "");
  if (!t || t.length > 40 || /[,;@]/.test(t) || /\d/.test(t) || t.split(/\s+/).length > 5) return null;
  const key = t.toLowerCase().replace(/\s+/g, " ");
  for (const [id, re] of HEADINGS) if (re.test(key)) return id;
  return null;
}

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE_ONE = `(?:(?:${MONTHS})\\.?,? ?'?\\d{2,4}|\\d{1,2}[/.]\\d{4}|\\d{4}-\\d{2}|(?:19|20)\\d{2})`;
const NOW = "present|current|currently|now|ongoing|till date|to date|today";
const RANGE = new RegExp(`(${DATE_ONE})\\s*(?:-|\\u2013|\\u2014|to|until|till)\\s*(${DATE_ONE}|${NOW})`, "i");
const SINGLE_YEAR = /\b((?:19|20)\d{2})\b/;

const MON3: Record<string, string> = { jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", may: "May", jun: "Jun", jul: "Jul", aug: "Aug", sep: "Sep", oct: "Oct", nov: "Nov", dec: "Dec" };

/** "sept. 2021" -> "Sep 2021", "9/2021" -> "09/2021", "Current" -> "Present", "21" stays as typed otherwise. */
export function normaliseDate(raw: string): string {
  const s = raw.trim().replace(/[,.']/g, " ").replace(/\s+/g, " ").trim();
  if (new RegExp(`^(?:${NOW})$`, "i").test(s)) return "Present";
  const m = s.match(new RegExp(`^(${MONTHS})\\w* ?(\\d{2,4})$`, "i"));
  if (m) {
    const y = m[2].length === 2 ? `20${m[2]}` : m[2];
    return `${MON3[m[1].slice(0, 3).toLowerCase()]} ${y}`;
  }
  const n = s.match(/^(\d{1,2})[/.](\d{4})$/);
  if (n) return `${n[1].padStart(2, "0")}/${n[2]}`;
  return s;
}

const BULLET = /^\s*(?:[•●▪■◦‣⁃∙·*►➤→>–—\-]|\(?[a-z0-9]{1,2}[.)])\s+/;
const isBullet = (l: string) => BULLET.test(l) && !/^\s*[-–—]\s*\d{4}/.test(l);
const stripBullet = (l: string) => l.replace(BULLET, "").trim();

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,5}[\s.-]?\d{3,5}[\s.-]?\d{3,5}/;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,;|)]*)?/gi;

const ROLE_WORDS =
  /\b(?:engineer|developer|manager|analyst|designer|intern|trainee|lead|consultant|specialist|director|officer|associate|architect|administrator|scientist|assistant|executive|coordinator|head|founder|co-founder|president|vp|programmer|tester|qa|sdet|writer|editor|accountant|nurse|teacher|lecturer|professor|researcher|technician|supervisor|recruiter|representative|advisor|adviser|strategist|owner|partner|apprentice|fellow|freelancer|devops|sre|admin)\b/i;
const SCHOOL_WORDS = /\b(?:university|college|institute|school|academy|polytechnic|iit|nit|iiit|vidyalaya|universit[aeéà]t?)\b/i;
const DEGREE_WORDS =
  /\b(?:b\.?\s?tech|b\.?\s?e\.?|b\.?\s?sc|b\.?\s?a\.?|b\.?\s?com|bca|bba|m\.?\s?tech|m\.?\s?e\.?|m\.?\s?sc|m\.?\s?a\.?|m\.?\s?com|mca|mba|ph\.?\s?d|bachelor|master|doctor|diploma|associate|degree|certificate|high school|secondary|higher secondary|hsc|ssc|12th|10th|a-levels?|gcse|baccalaureate)\b/i;

const clean = (s: string) => s.replace(/[   ]/g, " ").replace(/[​-‍﻿]/g, "").replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/[ \t]+/g, " ").trim();

function cleanLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .split("\n")
    .map((l) => clean(l).slice(0, 400)) // a very long line is never a heading or an entry, and cutting it keeps the patterns below fast
    .filter((l) => !/^(?:page\s*)?\d+\s*(?:of|\/)\s*\d+$/i.test(l) && !/^-- \d+ of \d+ --$/.test(l));
}

/** Split "Senior Engineer | Acme Ltd, Pune" style text into its pieces. */
const pieces = (s: string): string[] =>
  s
    .split(/\s+[|•·–—@]\s+|\s+-\s+|\s*\|\s*|\s{3,}|\s+at\s+/i)
    .map((p) => p.replace(/^[,;:\s]+|[,;:\s]+$/g, ""))
    .filter(Boolean);

function parseRange(line: string): { start: string; end: string; rest: string } | null {
  const m = line.match(RANGE);
  if (m && m.index !== undefined) {
    const rest = (line.slice(0, m.index) + " " + line.slice(m.index + m[0].length)).replace(/[()\[\]]/g, " ").replace(/\s+/g, " ").trim();
    return { start: normaliseDate(m[1]), end: normaliseDate(m[2]), rest: rest.replace(/^[,;:|–—-]+|[,;:|–—-]+$/g, "").trim() };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------- contact

function parseContact(head: string[]): { contact: Resume["contact"]; used: number } {
  const text = head.join("\n");
  const email = text.match(EMAIL)?.[0] ?? "";
  const withoutEmail = text.replace(EMAIL, " ");
  const phone = (withoutEmail.match(PHONE)?.[0] ?? "").trim();
  const links: Resume["contact"]["links"] = [];
  for (const raw of withoutEmail.match(URL_RE) ?? []) {
    if (links.length >= 5) break;
    if (/^\d/.test(raw) || raw.includes("@") || !/[a-z]/i.test(raw)) continue;
    const url = (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/[.,;)]+$/, "");
    if (!/^https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}/i.test(url)) continue;
    const label = /linkedin\./i.test(url) ? "LinkedIn" : /github\./i.test(url) ? "GitHub" : /gitlab\./i.test(url) ? "GitLab" : "Portfolio";
    if (!links.some((l) => l.url.toLowerCase() === url.toLowerCase())) links.push({ label, url });
  }
  const contactish = (l: string) => EMAIL.test(l) || (PHONE.test(l) && /\d{7,}/.test(l.replace(/\D/g, ""))) || /https?:|www\.|linkedin|github/i.test(l);

  // name: the first short line of letters that is not a heading or contact line
  let name = "";
  let nameAt = -1;
  for (let i = 0; i < Math.min(head.length, 6); i++) {
    const l = head[i];
    if (!l || contactish(l) || headingOf(l)) continue;
    const words = l.split(" ");
    if (words.length >= 1 && words.length <= 5 && l.length <= 60 && !/\d/.test(l) && /^[\p{L}][\p{L}\p{M}.'’ -]*$/u.test(l)) {
      name = l.replace(/\s+/g, " ");
      nameAt = i;
      break;
    }
  }
  // the name is often shouted ("JANE DOE"): make it ordinary capitals
  if (name && name === name.toUpperCase() && /[A-Z]{2}/.test(name)) name = name.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

  let headline = "";
  let location = "";
  for (let i = nameAt + 1; i < Math.min(head.length, nameAt + 6); i++) {
    const l = head[i];
    if (!l || headingOf(l)) break;
    const stripped = l.replace(EMAIL, " ").replace(PHONE, " ").replace(URL_RE, " ").replace(/[|•·]+/g, " ").replace(/\s+/g, " ").trim();
    if (!stripped) continue;
    if (!location && /^[\p{L}.'’ -]+,\s*[\p{L}.'’ -]+(?:,\s*[\p{L}.'’ -]+)?$/u.test(stripped) && stripped.length <= 60 && !ROLE_WORDS.test(stripped)) location = stripped;
    else if (!headline && stripped.length <= 100 && ROLE_WORDS.test(stripped) && !/[.!?]$/.test(stripped)) headline = stripped;
  }
  // "City, Country" is sometimes on the same line as the phone and email
  if (!location) {
    for (const l of head.slice(0, 8)) {
      const parts = l.split(/\s*[|•·]\s*/);
      const loc = parts.find((p) => /^[\p{L}.'’ -]+,\s*[\p{L}.'’ -]+$/u.test(p) && p.length <= 60 && !EMAIL.test(p) && !ROLE_WORDS.test(p));
      if (loc) {
        location = loc;
        break;
      }
    }
  }
  return { contact: { fullName: name, headline, email, phone, location, links }, used: nameAt + 1 };
}

// ---------------------------------------------------------------------------------------------- sections

function splitSections(lines: string[]): { head: string[]; sections: { id: SectionId; title: string; lines: string[] }[] } {
  const head: string[] = [];
  const sections: { id: SectionId; title: string; lines: string[] }[] = [];
  let cur: (typeof sections)[number] | null = null;
  for (const l of lines) {
    if (!l) continue;
    const id = headingOf(l);
    if (id) {
      cur = { id, title: l.replace(/[:.\s]+$/, ""), lines: [] };
      sections.push(cur);
    } else if (cur) cur.lines.push(l);
    else head.push(l);
  }
  return { head, sections };
}

function parseSkills(lines: string[]): Resume["skills"] {
  const groups: Resume["skills"] = [];
  const loose: string[] = [];
  const items = (s: string) =>
    s
      .split(/[,;|•·]|\s{2,}|\s\/\s/)
      .map((x) => stripBullet(x).replace(/^and\s+/i, "").trim())
      .filter((x) => x && x.length <= 40 && !/[.!?]$/.test(x));
  for (const raw of lines) {
    const l = stripBullet(raw);
    const m = l.match(/^([^:]{2,40}):\s*(.+)$/);
    if (m && !/^https?$/i.test(m[1])) {
      const its = items(m[2]);
      if (its.length) groups.push({ label: m[1].trim(), items: its.slice(0, 25) });
    } else loose.push(...items(l));
  }
  if (loose.length) groups.push({ label: "Skills", items: [...new Set(loose)].slice(0, 25) });
  return groups.slice(0, 8);
}

const looksLikeHeaderLine = (l: string) => l.length <= 90 && !isBullet(l) && !/[.!?]$/.test(l);

interface Entry {
  header: string[];
  start: string;
  end: string;
  bullets: string[];
}

/**
 * Split an experience-like section into entries. A line with a date range starts one; the short lines just
 * before it (role / company) and sometimes just after it belong to its heading; the rest are its bullets.
 */
function entries(lines: string[]): Entry[] {
  const out: Entry[] = [];
  let pending: string[] = [];
  let cur: Entry | null = null;
  const hasDate = (l: string) => !!parseRange(l);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const range = parseRange(l);
    if (range) {
      cur = { header: [...pending, ...(range.rest ? [range.rest] : [])], start: range.start, end: range.end, bullets: [] };
      pending = [];
      out.push(cur);
      // role or company printed on the line AFTER the dates ("Acme Corp  2020 - 2022 \n Senior Engineer")
      const next = lines[i + 1];
      if (cur.header.length < 2 && next && !isBullet(next) && !hasDate(next) && looksLikeHeaderLine(next) && (ROLE_WORDS.test(next) || SCHOOL_WORDS.test(next) || DEGREE_WORDS.test(next)) && next.split(" ").length <= 9) {
        cur.header.push(next);
        i++;
      }
      continue;
    }
    if (isBullet(l)) {
      if (cur) cur.bullets.push(stripBullet(l));
      continue;
    }
    // a short line followed (directly or after one more short line) by a date line is the next entry's heading
    const n1 = lines[i + 1];
    const n2 = lines[i + 2];
    const startsNext = looksLikeHeaderLine(l) && ((n1 && hasDate(n1)) || (n1 && looksLikeHeaderLine(n1) && !isBullet(n1) && n2 && hasDate(n2)));
    if (startsNext) {
      pending.push(l);
      continue;
    }
    if (cur) {
      const last = cur.bullets.length - 1;
      // a wrapped line continues the bullet above it
      if (last >= 0 && (/^[a-z(]/.test(l) || /[,;:(&-]$/.test(cur.bullets[last]))) cur.bullets[last] += " " + l;
      else cur.bullets.push(l);
    } else pending.push(l);
  }
  return out;
}

const COMPANY_SUFFIX = /^(?:inc|ltd|llc|pvt|corp|co|limited|plc|gmbh|llp|pte|sa|ag|bv)\.?$/i;
const PLACE = /^[\p{L}.'’ -]+(?:,\s*[\p{L}.'’ -]+)+$/u;

function splitRoleCompany(header: string[]): { role: string; company: string; location: string } {
  const parts = header.flatMap((h) => pieces(h));
  let role = "";
  let company = "";
  let place = "";
  const rest: string[] = [];
  for (const p of parts) {
    if (!role && ROLE_WORDS.test(p) && p.split(" ").length <= 8) role = p;
    else if (!company) {
      // "Acme Corp, Bengaluru" is the company and then where it is; "Acme, Inc." is all company
      const m = p.match(/^(.+?),\s*([\p{L}.'’ -]+(?:,\s*[\p{L}.'’ -]+)?)$/u);
      if (m && !COMPANY_SUFFIX.test(m[2].trim())) {
        company = m[1];
        place = m[2];
      } else company = p;
    } else rest.push(p);
  }
  if (!role && company && parts.length >= 2) {
    role = parts[0];
    company = parts[1];
  }
  const location = place || (rest.find((p) => PLACE.test(p)) ?? "");
  return { role: role.slice(0, 100), company: company.slice(0, 100), location: location.slice(0, 80) };
}

function parseExperience(lines: string[]): Resume["experience"] {
  return entries(lines)
    .slice(0, 12)
    .map((e) => {
      const { role, company, location } = splitRoleCompany(e.header);
      return { id: newId(), company, role, location, start: e.start, end: e.end, bullets: e.bullets.filter((b) => b.length > 2).slice(0, 8).map((b) => b.slice(0, 300)) };
    })
    .filter((e) => e.role || e.company || e.bullets.length);
}

function parseEducation(lines: string[]): Resume["education"] {
  const found: Resume["education"] = [];
  const fromEntries = entries(lines);
  const consumed = new Set<string>();
  for (const e of fromEntries.slice(0, 5)) {
    // "B.Tech in Computer Science, VTU": split on commas as well, so the degree and the school come apart
    const parts = e.header.flatMap((h) => pieces(h)).flatMap((p) => (DEGREE_WORDS.test(p) && p.includes(",") ? p.split(/,\s*/) : [p]));
    const school = parts.find((p) => SCHOOL_WORDS.test(p)) ?? "";
    const degree = parts.find((p) => p !== school && DEGREE_WORDS.test(p)) ?? "";
    const other = parts.filter((p) => p !== school && p !== degree);
    const details = [...other.filter((p) => /gpa|cgpa|%|honou?rs|distinction|first class|magna|cum laude/i.test(p)), ...e.bullets.filter((b) => /gpa|cgpa|%|honou?rs|distinction|first class|magna|cum laude/i.test(b))].join("; ");
    const s = school || other.find((p) => !/gpa|cgpa|%/i.test(p)) || "";
    consumed.add(s);
    found.push({ id: newId(), school: s.slice(0, 120), degree: degree.slice(0, 120), start: e.start, end: e.end === "Present" ? "Present" : e.end, details: details.slice(0, 200) });
  }
  if (found.length) return found;
  // no date ranges: one entry per pair of lines, or a single year as the end date
  const plain = lines.filter((l) => !isBullet(l));
  let i = 0;
  while (i < plain.length && found.length < 5) {
    const line = plain[i];
    const parts = pieces(line);
    const year = line.match(SINGLE_YEAR)?.[1] ?? "";
    const school = parts.find((p) => SCHOOL_WORDS.test(p)) ?? "";
    const degree = parts.find((p) => DEGREE_WORDS.test(p)) ?? "";
    if (school || degree) {
      const nxt = plain[i + 1];
      const nxtParts = nxt ? pieces(nxt) : [];
      const s2 = school || nxtParts.find((p) => SCHOOL_WORDS.test(p)) || "";
      const d2 = degree || nxtParts.find((p) => DEGREE_WORDS.test(p)) || "";
      found.push({ id: newId(), school: s2.replace(SINGLE_YEAR, "").trim().slice(0, 120), degree: d2.replace(SINGLE_YEAR, "").trim().slice(0, 120), start: "", end: year || (nxt?.match(SINGLE_YEAR)?.[1] ?? ""), details: "" });
      i += school && degree ? 1 : 2;
    } else i++;
  }
  return found;
}

function parseProjects(lines: string[]): Resume["projects"] {
  const out: Resume["projects"] = [];
  let cur: Resume["projects"][number] | null = null;
  for (const l of lines) {
    const tech = l.match(/^(?:tech(?:nologies)?(?: stack)?|stack|built with|tools)\s*:\s*(.+)$/i);
    if (tech && cur) {
      cur.tech = tech[1].split(/[,;|]/).map((t) => t.trim()).filter((t) => t && t.length <= 40).slice(0, 15);
      continue;
    }
    if (isBullet(l) && cur) {
      if (cur.bullets.length < 5) cur.bullets.push(stripBullet(l).slice(0, 300));
      continue;
    }
    if (!isBullet(l) && looksLikeHeaderLine(l) && (!cur || cur.bullets.length > 0 || !/^[a-z]/.test(l)) && out.length < 8 && (!cur || cur.bullets.length > 0 || cur.tech.length > 0)) {
      const url = l.match(URL_RE)?.find((u) => /\//.test(u) || /github|gitlab/i.test(u));
      const name = l.replace(URL_RE, " ").replace(/[()|–—-]+\s*$/g, "").replace(/\s+/g, " ").trim();
      cur = { id: newId(), name: (name || l).slice(0, 100), link: url ? (/^https?:/i.test(url) ? url : `https://${url}`).slice(0, 200) : "", tech: [], bullets: [] };
      out.push(cur);
    } else if (cur && cur.bullets.length < 5) cur.bullets.push(l.slice(0, 300));
  }
  return out;
}

export function parseResumeText(text: string): ImportReport {
  const lines = cleanLines(text.slice(0, 60_000));
  const { head, sections } = splitSections(lines);
  const notes: string[] = [];
  const { contact } = parseContact(head.length ? head : lines.slice(0, 12));

  const get = (id: SectionId) => sections.filter((s) => s.id === id).flatMap((s) => s.lines);
  const summaryLines = get("summary");
  const summary = summaryLines.map(stripBullet).join(" ").replace(/\s+/g, " ").slice(0, 600);
  const skills = parseSkills(get("skills"));
  const experience = parseExperience(get("experience"));
  const education = parseEducation(get("education"));
  const projects = parseProjects(get("projects"));
  const certifications = get("certifications")
    .map(stripBullet)
    .filter((l) => l.length > 2 && l.length <= 120)
    .slice(0, 10);

  const resume = looseResume({ contact, summary, skills: skills.length ? skills : [{ label: "Skills", items: [] }], experience, education, projects, certifications });

  if (!sections.some((s) => s.id !== "other")) notes.push("We could not find section headings such as Experience or Education, so only your contact details were filled in. You can type the rest in your profile.");
  if (!contact.fullName) notes.push("We could not tell your name. Please type it in.");
  if (!contact.email) notes.push("We could not find an email address. Please add it, because it is needed on your resume.");
  const longRoles = experience.filter((e) => e.bullets.length === 0).length;
  if (experience.length && longRoles) notes.push(`${longRoles} job${longRoles > 1 ? "s have" : " has"} no points under ${longRoles > 1 ? "them" : "it"}. Check them.`);
  const skipped = [...new Set(sections.filter((s) => s.id === "other" && s.lines.length).map((s) => s.title))];
  if (skipped.length) notes.push(`Not imported: ${skipped.slice(0, 4).join(", ")}. They are not part of the profile.`);
  if (summaryLines.length) notes.push("Your old summary was not kept. The AI writes a fresh one for each job.");

  return {
    resume,
    found: { roles: resume.experience.length, education: resume.education.length, skills: resume.skills.reduce((n, g) => n + g.items.length, 0), projects: resume.projects.length, certifications: resume.certifications.length },
    notes,
  };
}
