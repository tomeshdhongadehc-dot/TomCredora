import { z } from "zod";

export const SCHEMA_VERSION = 1;

// Plain printable text only: strips control chars so exports/PDF never choke.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.replace(CONTROL_CHARS, "").trim());

const optionalText = (max: number) => text(max).optional().default("");

export const LIMITS = {
  jd: 12_000,
  summary: 600,
  bullet: 300,
  bulletsPerRole: 8,
  roles: 12,
} as const;

export const contactSchema = z.strictObject({
  fullName: text(80).refine((s) => s.length > 0, "Name is required"),
  headline: optionalText(100),
  email: z.email().max(120),
  phone: optionalText(30),
  location: optionalText(80),
  links: z
    .array(z.strictObject({ label: text(30), url: z.url({ protocol: /^https?$/ }).max(200) }))
    .max(5)
    .default([]),
});

export const experienceSchema = z.strictObject({
  id: z.string().max(40),
  company: text(100),
  role: text(100),
  location: optionalText(80),
  start: text(20),
  end: text(20), // "Present" allowed
  bullets: z.array(text(LIMITS.bullet)).max(LIMITS.bulletsPerRole),
});

export const projectSchema = z.strictObject({
  id: z.string().max(40),
  name: text(100),
  link: optionalText(200),
  tech: z.array(text(40)).max(15).default([]),
  bullets: z.array(text(LIMITS.bullet)).max(5),
});

export const educationSchema = z.strictObject({
  id: z.string().max(40),
  school: text(120),
  degree: text(120),
  start: optionalText(20),
  end: optionalText(20),
  details: optionalText(200),
});

export const skillGroupSchema = z.strictObject({
  label: text(40),
  items: z.array(text(40)).max(25),
});

export const resumeSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  contact: contactSchema,
  summary: optionalText(LIMITS.summary),
  skills: z.array(skillGroupSchema).max(8).default([]),
  experience: z.array(experienceSchema).max(LIMITS.roles).default([]),
  projects: z.array(projectSchema).max(8).default([]),
  education: z.array(educationSchema).max(5).default([]),
  certifications: z.array(text(120)).max(10).default([]),
});

export type Resume = z.infer<typeof resumeSchema>;
export type Experience = z.infer<typeof experienceSchema>;

export const jdInputSchema = z.strictObject({
  jd: text(LIMITS.jd).refine((s) => s.length >= 40, "Job description is too short"),
});
