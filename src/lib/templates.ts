import { z } from "zod";
import type { Resume } from "./schema";

export const SECTION_IDS = ["summary", "skills", "experience", "projects", "education", "certifications"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const CONTACT_FIELDS = ["email", "phone", "location", "links"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

const unique = (a: readonly unknown[]) => new Set(a).size === a.length;

/** Fonts that every ATS parser and OS handles. Stacks fall back to metric-compatible faces. */
export const FONTS = {
  calibri: { label: "Calibri (sans)", css: "Calibri, Carlito, Arial, Helvetica, sans-serif", docx: "Calibri", latex: "sans" },
  arial: { label: "Arial (sans)", css: "Arial, Helvetica, Liberation Sans, sans-serif", docx: "Arial", latex: "sans" },
  georgia: { label: "Georgia (serif)", css: "Georgia, 'Times New Roman', serif", docx: "Georgia", latex: "serif" },
  times: { label: "Times New Roman (serif)", css: "'Times New Roman', Times, Liberation Serif, serif", docx: "Times New Roman", latex: "serif" },
} as const;
export type FontId = keyof typeof FONTS;

/** Accents are dark enough for 4.5:1 contrast on white and survive grayscale printing. */
export const ACCENTS = {
  black: "#000000",
  navy: "#1f3a5f",
  forest: "#1f5f4a",
  maroon: "#7a1f2b",
  slate: "#374151",
} as const;
export type AccentId = keyof typeof ACCENTS;

export const templateConfigSchema = z.strictObject({
  id: z.string().max(30),
  font: z.enum(Object.keys(FONTS) as [FontId, ...FontId[]]),
  sizePt: z.number().min(8).max(14),
  lineHeight: z.number().min(1.05).max(1.8),
  marginIn: z.number().min(0.25).max(1.25),
  paper: z.enum(["letter", "a4"]),
  accent: z.enum(Object.keys(ACCENTS) as [AccentId, ...AccentId[]]),
  headerAlign: z.enum(["center", "left", "right"]),
  headingStyle: z.enum(["rule", "plain", "accent", "bar", "tick", "shade"]),
  headingCase: z.enum(["upper", "title", "smallcaps"]),
  bullet: z.enum(["disc", "dash", "circle"]),
  nameSize: z.enum(["md", "lg", "xl"]).default("md"),
  /** "caps": name in capitals with wide letter-spacing (uppercased in code, so every export agrees). */
  nameStyle: z.enum(["normal", "caps"]).default("normal"),
  /** A thin rule under the contact line, separating the header from the body. */
  headerRule: z.boolean().default(false),
  /** Which line leads each entry: the employer (classic) or the job title (what recruiters scan for). */
  entryOrder: z.enum(["company-first", "role-first"]).default("company-first"),
  /** "right": dates right-aligned. "inline": one linear line "Role | Company | dates" (reads best to parsers). */
  dateStyle: z.enum(["right", "inline", "dash"]).default("right"),
  skillsStyle: z.enum(["lines", "inline", "dash", "table"]).default("lines"),
  /** "split": the name sits centred between two contact blocks (details left, links right). "stack": name, then contact below. */
  headerStyle: z.enum(["stack", "split"]).default("stack"),
  /** Name and contact on a solid accent band with white text (still plain text in reading order). */
  headerBand: z.boolean().default(false),
  /** Weight of the dates on the right of an entry. */
  dateWeight: z.enum(["normal", "bold"]).default("normal"),
  /** Where an education entry's details text (honours, main courses) goes: beside the school, or on its own line below. */
  educationDetails: z.enum(["right", "below"]).default("right"),
  /** Contact details in a muted grey, and/or underlined (looks like links). Accent colour wins over grey. */
  contactMuted: z.boolean().default(false),
  contactUnderline: z.boolean().default(false),
  /** Projects: name and technologies stacked, or on one line ("Name | tech"). */
  projectStyle: z.enum(["stacked", "inline"]).default("stacked"),
  /** Name weight and colour. "auto" colour keeps the old rule: extra-large names take the accent colour. */
  nameWeight: z.enum(["bold", "regular"]).default("bold"),
  nameColor: z.enum(["auto", "ink", "accent"]).default("auto"),
  /** Contact details (email, links...) drawn in the accent colour. */
  contactAccent: z.boolean().default(false),
  /** Section heading weight. */
  headingWeight: z.enum(["bold", "regular"]).default("bold"),
  /** How the lead term of each entry (job title, skill group, degree) is drawn: bold black, or accent colour. */
  leadStyle: z.enum(["bold", "accent"]).default("bold"),
  /** Sections drawn without a heading line (a short intro under the header, for example). */
  untitled: z.array(z.enum(SECTION_IDS)).max(SECTION_IDS.length).refine(unique, "Duplicate section").default([]),
  /** Sections the user chose not to show. They stay in sectionOrder so re-showing one keeps its place. */
  hidden: z.array(z.enum(SECTION_IDS)).max(SECTION_IDS.length).refine(unique, "Duplicate section").default([]),
  /** Custom heading text per section. ATS parsers match standard names best, so the guard warns about unusual ones. */
  sectionTitles: z.partialRecord(z.enum(SECTION_IDS), z.string().trim().min(1).max(30).regex(/^[A-Za-z][A-Za-z &/,'-]*$/)).default({}),
  /** Which contact details appear, and in what order (omit one to hide it). */
  contactOrder: z.array(z.enum(CONTACT_FIELDS)).max(CONTACT_FIELDS.length).refine(unique, "Duplicate field").default([...CONTACT_FIELDS]),
  contactSep: z.enum(["pipe", "slash", "dot", "comma"]).default("pipe"),
  contactLayout: z.enum(["line", "stacked"]).default("line"),
  /** Vertical space before each section heading. */
  sectionGap: z.enum(["tight", "normal", "airy"]).default("normal"),
  sectionOrder: z
    .array(z.enum(SECTION_IDS))
    .length(SECTION_IDS.length)
    .refine((a) => new Set(a).size === a.length, "Duplicate section"),
});
export type TemplateConfig = z.infer<typeof templateConfigSchema>;

export interface TemplatePreset {
  id: string;
  name: string;
  blurb: string;
  tags: string[];
  config: TemplateConfig;
}

/** Preset literals may omit options that have defaults; they are parsed (and so filled in) once below. */
interface RawPreset extends Omit<TemplatePreset, "config"> {
  config: z.input<typeof templateConfigSchema>;
}

const LAYOUT = { nameSize: "md", nameStyle: "normal", headerRule: false, entryOrder: "company-first", dateStyle: "right", skillsStyle: "lines" } as const;
const ORDER: SectionId[] = ["summary", "skills", "experience", "projects", "education", "certifications"];

const RAW_PRESETS: RawPreset[] = [
  {
    id: "classic",
    name: "Classic",
    blurb: "Centered header, ruled headings. The safe default for any industry.",
    tags: ["1 page", "Any industry"],
    config: { ...LAYOUT, id: "classic", font: "calibri", sizePt: 11, lineHeight: 1.3, marginIn: 0.65, paper: "letter", accent: "black", headerAlign: "center", headingStyle: "rule", headingCase: "upper", bullet: "disc", sectionOrder: ORDER },
  },
  {
    id: "modern",
    name: "Modern",
    blurb: "Left-aligned header with a single quiet accent colour. No rules, lots of air.",
    tags: ["1 page", "Tech", "Design"],
    config: { ...LAYOUT, id: "modern", font: "arial", sizePt: 10.5, lineHeight: 1.35, marginIn: 0.75, paper: "letter", accent: "forest", headerAlign: "left", headingStyle: "accent", headingCase: "upper", bullet: "dash", sectionOrder: ORDER },
  },
  {
    id: "compact",
    name: "Compact",
    blurb: "Dense and tight to fit more experience on one page without crowding.",
    tags: ["1 page", "Senior", "Dense"],
    config: { ...LAYOUT, id: "compact", font: "calibri", sizePt: 10, lineHeight: 1.18, marginIn: 0.5, paper: "letter", accent: "black", headerAlign: "left", headingStyle: "rule", headingCase: "upper", bullet: "disc", sectionOrder: ORDER },
  },
  {
    id: "academic",
    name: "Academic",
    blurb: "Serif, formal and understated. Education first. Suits research and finance.",
    tags: ["1-2 pages", "Research", "Finance"],
    config: { ...LAYOUT, id: "academic", font: "times", sizePt: 11, lineHeight: 1.25, marginIn: 0.8, paper: "letter", accent: "navy", headerAlign: "center", headingStyle: "rule", headingCase: "title", bullet: "disc", sectionOrder: ["summary", "education", "experience", "projects", "skills", "certifications"] },
  },
  {
    id: "engineer",
    name: "Engineer",
    blurb: "Job title leads each entry, skills up top, projects included. Built for technical roles.",
    tags: ["1 page", "Tech", "Engineering"],
    config: { nameStyle: "normal", headerRule: false, id: "engineer", font: "calibri", sizePt: 10.5, lineHeight: 1.25, marginIn: 0.6, paper: "letter", accent: "navy", headerAlign: "center", headingStyle: "rule", headingCase: "upper", bullet: "disc", nameSize: "lg", entryOrder: "role-first", dateStyle: "right", skillsStyle: "lines", sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications"] },
  },
  {
    id: "executive",
    name: "Executive",
    blurb: "Large name, serif body, core-competencies line. Room for two pages of leadership.",
    tags: ["2 pages", "Senior", "Leadership"],
    config: { nameStyle: "normal", headerRule: false, id: "executive", font: "georgia", sizePt: 11, lineHeight: 1.3, marginIn: 0.8, paper: "letter", accent: "maroon", headerAlign: "left", headingStyle: "accent", headingCase: "title", bullet: "disc", nameSize: "xl", entryOrder: "role-first", dateStyle: "right", skillsStyle: "inline", sectionOrder: ["summary", "skills", "experience", "education", "certifications", "projects"] },
  },
  {
    id: "minimal",
    name: "Minimal",
    blurb: "No rules or colour. Every entry on one linear line, which parsers read most reliably.",
    tags: ["1 page", "Any industry", "Simple"],
    config: { nameStyle: "normal", headerRule: false, id: "minimal", font: "arial", sizePt: 10.5, lineHeight: 1.4, marginIn: 0.9, paper: "letter", accent: "black", headerAlign: "left", headingStyle: "plain", headingCase: "title", bullet: "dash", nameSize: "md", entryOrder: "company-first", dateStyle: "inline", skillsStyle: "inline", sectionOrder: ORDER },
  },
  {
    id: "graduate",
    name: "Graduate",
    blurb: "Education and projects first, for students and early-career applicants.",
    tags: ["1 page", "Entry level", "Student"],
    config: { nameStyle: "normal", headerRule: false, id: "graduate", font: "calibri", sizePt: 11, lineHeight: 1.3, marginIn: 0.7, paper: "letter", accent: "forest", headerAlign: "center", headingStyle: "rule", headingCase: "upper", bullet: "disc", nameSize: "lg", entryOrder: "role-first", dateStyle: "right", skillsStyle: "lines", sectionOrder: ["summary", "education", "projects", "experience", "skills", "certifications"] },
  },
  {
    id: "slate",
    name: "Slate",
    blurb: "Capitalised, letter-spaced name over a rule, with accent bars on each heading. Corporate and calm.",
    tags: ["1 page", "Corporate", "Consulting"],
    config: { id: "slate", font: "arial", sizePt: 10.5, lineHeight: 1.3, marginIn: 0.7, paper: "letter", accent: "slate", headerAlign: "left", headingStyle: "bar", headingCase: "upper", bullet: "circle", nameSize: "lg", nameStyle: "caps", headerRule: true, entryOrder: "company-first", dateStyle: "right", skillsStyle: "lines", sectionOrder: ["summary", "experience", "skills", "education", "projects", "certifications"] },
  },
  {
    id: "ledger",
    name: "Ledger",
    blurb: "Formal serif with a centred capitalised name and short accent ticks under headings. Finance and legal.",
    tags: ["1-2 pages", "Finance", "Legal"],
    config: { id: "ledger", font: "georgia", sizePt: 10.5, lineHeight: 1.3, marginIn: 0.85, paper: "letter", accent: "maroon", headerAlign: "center", headingStyle: "tick", headingCase: "title", bullet: "disc", nameSize: "lg", nameStyle: "caps", headerRule: true, entryOrder: "role-first", dateStyle: "right", skillsStyle: "inline", sectionOrder: ["summary", "experience", "education", "skills", "certifications", "projects"] },
  },
  {
    id: "spotlight",
    name: "Spotlight",
    blurb: "A bold accent-coloured name, single-line entries and a punchy skills strip. Sales, marketing, growth.",
    tags: ["1 page", "Sales", "Marketing"],
    config: { id: "spotlight", font: "calibri", sizePt: 11, lineHeight: 1.3, marginIn: 0.7, paper: "letter", accent: "navy", headerAlign: "left", headingStyle: "accent", headingCase: "upper", bullet: "disc", nameSize: "xl", nameStyle: "normal", headerRule: true, entryOrder: "role-first", dateStyle: "inline", skillsStyle: "inline", sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications"] },
  },
  {
    id: "pioneer",
    name: "Pioneer",
    blurb: "Centred, airy and modern with green ticks. Startups, product and design roles.",
    tags: ["1 page", "Startup", "Product"],
    config: { id: "pioneer", font: "calibri", sizePt: 11, lineHeight: 1.4, marginIn: 0.8, paper: "letter", accent: "forest", headerAlign: "center", headingStyle: "tick", headingCase: "upper", bullet: "circle", nameSize: "lg", nameStyle: "caps", headerRule: false, entryOrder: "role-first", dateStyle: "right", skillsStyle: "lines", sectionOrder: ["summary", "experience", "projects", "skills", "education", "certifications"] },
  },
  {
    id: "curve",
    name: "Curve",
    blurb: "A centred accent-blue name, dot-separated contact line, a short intro with no heading, and entries led by a coloured term and an em dash. Inspired by the CurVe CV.",
    tags: ["1-2 pages", "Academic", "Research"],
    config: { id: "curve", font: "times", sizePt: 11, lineHeight: 1.3, marginIn: 0.85, paper: "letter", accent: "navy", headerAlign: "center", headingStyle: "rule", headingCase: "title", bullet: "dash", nameSize: "lg", nameStyle: "caps", nameWeight: "regular", nameColor: "accent", headerRule: false, contactSep: "dot", contactAccent: true, contactLayout: "line", headingWeight: "regular", leadStyle: "accent", untitled: ["summary"], entryOrder: "role-first", dateStyle: "dash", skillsStyle: "dash", sectionGap: "normal", sectionOrder: ["summary", "skills", "experience", "education", "projects", "certifications"] },
  },
  {
    id: "scholar",
    name: "Scholar",
    blurb: "The name sits between your contact details and links; small-caps headings, bold dates and aligned skill columns. Inspired by a classic academic CV. Check the ATS view: the header is the most designed part.",
    tags: ["1-2 pages", "Academic", "Engineering"],
    config: { id: "scholar", font: "times", sizePt: 11, lineHeight: 1.25, marginIn: 0.9, paper: "letter", accent: "black", headerAlign: "center", headerStyle: "split", headingStyle: "plain", headingCase: "smallcaps", headingWeight: "regular", bullet: "disc", nameSize: "xl", nameStyle: "normal", nameWeight: "regular", nameColor: "ink", contactMuted: true, entryOrder: "role-first", dateStyle: "right", dateWeight: "bold", educationDetails: "below", skillsStyle: "table", leadStyle: "bold", sectionGap: "normal", sectionOrder: ["summary", "education", "experience", "projects", "skills", "certifications"] },
  },
  {
    id: "standard",
    name: "Standard",
    blurb: "The familiar one-page tech layout: bold centred name, underlined contact line, light headings with a thin rule, one-line projects. Inspired by a popular Overleaf resume (without its icons, which parsers cannot read).",
    tags: ["1 page", "Tech", "Software"],
    config: { id: "standard", font: "calibri", sizePt: 10.5, lineHeight: 1.2, marginIn: 0.55, paper: "letter", accent: "black", headerAlign: "center", headingStyle: "rule", headingCase: "title", headingWeight: "regular", bullet: "disc", nameSize: "lg", nameStyle: "normal", nameWeight: "bold", contactSep: "pipe", contactUnderline: true, entryOrder: "company-first", dateStyle: "right", projectStyle: "inline", skillsStyle: "lines", leadStyle: "bold", sectionGap: "tight", sectionTitles: { skills: "Technical Skills" }, sectionOrder: ["summary", "education", "experience", "projects", "skills", "certifications"] },
  },
  // The next five are layout families popular in open-source resume projects (Jake's Resume, Harvard career-office
  // format, Awesome-CV, moderncv, Reactive Resume). Only the visual idea is used: original code, single column, plain text.
  {
    id: "sprint",
    name: "Sprint",
    blurb: "Dense one-page serif with small-caps ruled headings and one-line projects, the layout most software students use. Education first.",
    tags: ["1 page", "Tech", "Entry level", "Dense"],
    config: { id: "sprint", font: "times", sizePt: 10.5, lineHeight: 1.18, marginIn: 0.5, paper: "letter", accent: "black", headerAlign: "center", headingStyle: "rule", headingCase: "smallcaps", headingWeight: "bold", bullet: "disc", nameSize: "xl", nameWeight: "bold", contactSep: "pipe", contactUnderline: true, entryOrder: "company-first", dateStyle: "right", projectStyle: "inline", skillsStyle: "lines", sectionGap: "tight", sectionOrder: ["summary", "education", "experience", "projects", "skills", "certifications"] },
  },
  {
    id: "crimson",
    name: "Crimson",
    blurb: "The formal career-office format: capitalised serif name, bold dates, education first, no colour. Trusted for finance, consulting and grad school.",
    tags: ["1 page", "Finance", "Consulting", "Entry level"],
    config: { id: "crimson", font: "times", sizePt: 11, lineHeight: 1.2, marginIn: 0.75, paper: "letter", accent: "black", headerAlign: "center", headingStyle: "rule", headingCase: "upper", headingWeight: "bold", bullet: "disc", nameSize: "lg", nameStyle: "caps", nameWeight: "bold", contactSep: "pipe", entryOrder: "company-first", dateStyle: "right", dateWeight: "bold", educationDetails: "below", skillsStyle: "lines", sectionGap: "normal", sectionOrder: ["summary", "education", "experience", "projects", "skills", "certifications"] },
  },
  {
    id: "vivid",
    name: "Vivid",
    blurb: "Left-aligned accent-coloured name and headings with coloured job titles. A confident modern look that still parses as plain text.",
    tags: ["1 page", "Tech", "Design", "Product"],
    config: { id: "vivid", font: "arial", sizePt: 10, lineHeight: 1.3, marginIn: 0.65, paper: "letter", accent: "maroon", headerAlign: "left", headingStyle: "accent", headingCase: "upper", headingWeight: "bold", bullet: "disc", nameSize: "xl", nameWeight: "bold", nameColor: "accent", contactSep: "pipe", leadStyle: "accent", entryOrder: "role-first", dateStyle: "right", skillsStyle: "table", sectionGap: "normal", sectionOrder: ["summary", "experience", "skills", "projects", "education", "certifications"] },
  },
  {
    id: "banner",
    name: "Banner",
    blurb: "Left header, serif body and a solid accent bar beside each heading, with stacked contact details. Polished for senior and corporate roles.",
    tags: ["1-2 pages", "Corporate", "Senior"],
    config: { id: "banner", font: "georgia", sizePt: 10.5, lineHeight: 1.3, marginIn: 0.8, paper: "letter", accent: "navy", headerAlign: "left", headingStyle: "bar", headingCase: "title", headingWeight: "bold", bullet: "disc", nameSize: "xl", nameWeight: "regular", nameColor: "accent", contactLayout: "stacked", contactMuted: true, entryOrder: "role-first", dateStyle: "dash", skillsStyle: "dash", sectionGap: "airy", sectionOrder: ["summary", "experience", "education", "skills", "projects", "certifications"] },
  },
  {
    id: "onyx",
    name: "Onyx",
    blurb: "Left header over a thick accent rule, grey contact line and clean title-case headings. Calm, modern and very readable.",
    tags: ["1 page", "Tech", "Startup", "Product"],
    config: { id: "onyx", font: "calibri", sizePt: 10.5, lineHeight: 1.3, marginIn: 0.7, paper: "letter", accent: "slate", headerAlign: "left", headingStyle: "rule", headingCase: "title", headingWeight: "bold", bullet: "circle", nameSize: "xl", nameWeight: "bold", nameColor: "accent", headerRule: true, contactMuted: true, contactSep: "dot", entryOrder: "role-first", dateStyle: "right", dateWeight: "bold", skillsStyle: "inline", sectionGap: "normal", sectionOrder: ["summary", "experience", "projects", "skills", "education", "certifications"] },
  },
  // Band and shaded-heading designs: colour lives in a fill behind plain text, so the text layer is unchanged.
  {
    id: "horizon",
    name: "Horizon",
    blurb: "A solid navy header band with white name and contact details, then calm shaded section titles. Bold and modern, still one column of plain text.",
    tags: ["1 page", "Tech", "Product", "Corporate"],
    config: { id: "horizon", font: "calibri", sizePt: 10.5, lineHeight: 1.28, marginIn: 0.6, paper: "letter", accent: "navy", headerAlign: "left", headerBand: true, headingStyle: "shade", headingCase: "upper", headingWeight: "bold", bullet: "disc", nameSize: "xl", nameWeight: "bold", contactSep: "pipe", entryOrder: "role-first", dateStyle: "right", dateWeight: "bold", skillsStyle: "table", sectionGap: "normal", sectionOrder: ["summary", "experience", "skills", "projects", "education", "certifications"] },
  },
  {
    id: "tint",
    name: "Tint",
    blurb: "Centred serif header over a thin rule; each section title sits on a soft green tint. Elegant for finance, law and academia.",
    tags: ["1-2 pages", "Finance", "Legal", "Academic"],
    config: { id: "tint", font: "georgia", sizePt: 10.5, lineHeight: 1.3, marginIn: 0.75, paper: "letter", accent: "forest", headerAlign: "center", headingStyle: "shade", headingCase: "smallcaps", headingWeight: "bold", bullet: "disc", nameSize: "xl", nameStyle: "caps", nameWeight: "regular", nameColor: "ink", headerRule: true, contactSep: "dot", contactMuted: true, entryOrder: "role-first", dateStyle: "right", skillsStyle: "lines", sectionGap: "normal", sectionOrder: ["summary", "experience", "education", "skills", "projects", "certifications"] },
  },
  {
    id: "atlas",
    name: "Atlas",
    blurb: "A deep maroon header band with a centred serif name, accent bars on headings and bold dates. Authoritative for senior and leadership roles.",
    tags: ["2 pages", "Senior", "Leadership"],
    config: { id: "atlas", font: "times", sizePt: 11, lineHeight: 1.3, marginIn: 0.7, paper: "letter", accent: "maroon", headerAlign: "center", headerBand: true, headingStyle: "bar", headingCase: "title", headingWeight: "bold", bullet: "disc", nameSize: "xl", nameStyle: "caps", nameWeight: "regular", contactSep: "dot", entryOrder: "role-first", dateStyle: "right", dateWeight: "bold", skillsStyle: "inline", sectionGap: "normal", sectionOrder: ["summary", "skills", "experience", "education", "projects", "certifications"] },
  },
];

export const PRESETS: TemplatePreset[] = RAW_PRESETS.map((p) => ({ ...p, config: templateConfigSchema.parse(p.config) }));

export const DEFAULT_CONFIG: TemplateConfig = PRESETS[0].config;

export function presetById(id: string): TemplatePreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

/** Name heading size relative to body text (shared by preview, DOCX and LaTeX). */
export const NAME_SPACING_EM = 0.08;
export const NAME_EM = { md: 1.8, lg: 2.1, xl: 2.6 } as const;

export const PAPER = {
  letter: { widthIn: 8.5, heightIn: 11, label: "US Letter" },
  a4: { widthIn: 210 / 25.4, heightIn: 297 / 25.4, label: "A4" },
} as const;

export const CONTACT_SEP = { pipe: " | ", slash: " / ", dot: " · ", comma: ", " } as const;
/** Space above each section heading, in em. */
export const GAP_EM = { tight: 0.7, normal: 1.1, airy: 1.7 } as const;

export const DEFAULT_TITLES: Record<SectionId, string> = {
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
};

/** Heading names ATS parsers reliably map to a section (lower-case). */
export const STANDARD_TITLES: Record<SectionId, string[]> = {
  summary: ["summary", "professional summary", "profile", "career summary", "executive summary"],
  skills: ["skills", "technical skills", "key skills", "core competencies", "core skills"],
  experience: ["experience", "work experience", "professional experience", "employment history", "work history", "career history"],
  projects: ["projects", "selected projects", "key projects", "personal projects"],
  education: ["education", "education and training", "academic background", "academic qualifications"],
  certifications: ["certifications", "certificates", "licenses and certifications", "licenses & certifications"],
};

/** Is the name drawn in the accent colour? ("auto" keeps the original rule: extra-large names are accent-coloured.) */
/** The accent mixed with white (default 12%): the fill behind "shade" headings. Same hex in preview, DOCX and LaTeX. */
export function tint(hex: string, amount = 0.12): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(255 - (255 - v) * amount * 1.0)
    .toString(16).padStart(2, "0");
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

export const nameIsAccent = (c: TemplateConfig): boolean => c.nameColor === "accent" || (c.nameColor === "auto" && c.nameSize === "xl");

/** Width (em) of the label column for aligned ("table") skills: wide enough for the longest label, within sane limits. */
export const skillLabelWidthEm = (labels: string[]): number => Math.min(14, Math.max(6, Math.ceil(Math.max(0, ...labels.map((l) => l.length)) * 0.62 + 1)));

/** Contact details split for the "split" header: personal details on the left, links on the right. */
export function splitContact(contact: Resume["contact"], c: TemplateConfig): { left: string[]; right: string[] } {
  const left = c.contactOrder.filter((f) => f !== "links").flatMap((f) => (f === "email" ? [contact.email] : f === "phone" ? [contact.phone] : [contact.location])).filter(Boolean);
  const right = c.contactOrder.includes("links") ? contact.links.map((l) => l.url).filter(Boolean) : [];
  return { left, right };
}

/** Sections that will actually be drawn, in order. Every renderer and exporter goes through this. */
export const visibleSections = (c: TemplateConfig): SectionId[] => c.sectionOrder.filter((id) => !c.hidden.includes(id));

/** The heading text for a section (the user's custom title, or the standard one). */
export const sectionTitle = (c: TemplateConfig, id: SectionId): string => c.sectionTitles[id]?.trim().replace(/\s+/g, " ") || DEFAULT_TITLES[id];

/** Contact details to show, already in the configured order. Shared so preview and every export agree. */
export function contactParts(contact: Resume["contact"], c: TemplateConfig): string[] {
  const value: Record<ContactField, string[]> = {
    email: [contact.email],
    phone: [contact.phone],
    location: [contact.location],
    links: contact.links.map((l) => l.url),
  };
  return c.contactOrder.flatMap((f) => value[f]).filter(Boolean);
}

/** Page height as a percentage of page width: what `cqw` units need. */
export const pageHeightCqw = (paper: TemplateConfig["paper"]) => (PAPER[paper].heightIn / PAPER[paper].widthIn) * 100;
/** Font size in points -> cqw on a page whose width is `widthIn` inches. */
export const ptToCqw = (pt: number, paper: TemplateConfig["paper"]) => (pt / (PAPER[paper].widthIn * 72)) * 100;
export const inToCqw = (inches: number, paper: TemplateConfig["paper"]) => (inches / PAPER[paper].widthIn) * 100;

export interface GuardWarning {
  id: string;
  message: string;
}

/** ATS/readability guard rails for customised settings. Never blocks, always explains. */
export function guardConfig(c: TemplateConfig): GuardWarning[] {
  const w: GuardWarning[] = [];
  if (c.sizePt < 9.5) w.push({ id: "size-small", message: "Text under 9.5pt is hard to read and some parsers skip it. Use 10pt or more." });
  if (c.sizePt > 12) w.push({ id: "size-large", message: "Text over 12pt wastes space and pushes you to two pages." });
  if (c.marginIn < 0.45) w.push({ id: "margin-small", message: "Margins under 0.45in can be clipped when printed." });
  if (c.lineHeight < 1.12) w.push({ id: "line-tight", message: "Very tight line spacing hurts readability." });
  const visible = visibleSections(c);
  const first = visible.indexOf("experience");
  if (first > 3) w.push({ id: "exp-late", message: "Recruiters look for experience first. Consider moving it higher unless you are a recent graduate." });
  if (c.hidden.includes("experience")) w.push({ id: "exp-hidden", message: "Experience is hidden. Most recruiters and ATS filters expect to find it." });
  for (const id of c.untitled) {
    if (id !== "summary") w.push({ id: `untitled-${id}`, message: `${DEFAULT_TITLES[id]} has no heading, so an ATS may not recognise it as that section. Only a short summary is safe without one.` });
  }
  if (!c.contactOrder.includes("email")) w.push({ id: "email-hidden", message: "Your email is hidden. Recruiters and ATS need it to reach you." });
  for (const id of SECTION_IDS) {
    const t = c.sectionTitles[id];
    if (t && !STANDARD_TITLES[id].includes(t.toLowerCase()))
      w.push({ id: `title-${id}`, message: `"${t}" may not be recognised by ATS parsers. Safer names: ${STANDARD_TITLES[id].slice(0, 3).map((x) => x[0].toUpperCase() + x.slice(1)).join(", ")}.` });
  }
  return w;
}

/** Semantic equality: key order must not matter (configs round-trip through storage and schema parsing). */
export function sameConfig(a: TemplateConfig, b: TemplateConfig): boolean {
  // key order must not matter, at any depth (sectionTitles is an object)
  const stable = (v: unknown): string =>
    JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => p.localeCompare(q))) : x));
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof TemplateConfig>;
  for (const k of keys) if (stable(a[k]) !== stable(b[k])) return false;
  return true;
}

/** Parse untrusted stored config; fall back to a preset on any problem. */
export function parseConfig(raw: unknown, fallback: TemplateConfig = DEFAULT_CONFIG): TemplateConfig {
  const r = templateConfigSchema.safeParse(raw);
  return r.success ? r.data : fallback;
}
