import { resumeSchema, type Resume } from "./schema";

const nonEmpty = (s: string) => s.trim().length > 0;

/** Strip empty rows/bullets/items that form editing leaves behind. Pure; does not validate. */
export function cleanResume(r: Resume): Resume {
  return {
    ...r,
    skills: r.skills
      .map((g) => ({ label: g.label.trim(), items: g.items.map((i) => i.trim()).filter(nonEmpty) }))
      .filter((g) => g.items.length > 0),
    experience: r.experience
      .filter((e) => nonEmpty(e.company) || nonEmpty(e.role))
      .map((e) => ({ ...e, bullets: e.bullets.filter(nonEmpty) })),
    projects: r.projects
      .filter((p) => nonEmpty(p.name))
      .map((p) => ({ ...p, tech: p.tech.map((t) => t.trim()).filter(nonEmpty), bullets: p.bullets.filter(nonEmpty) })),
    education: r.education.filter((e) => nonEmpty(e.school) || nonEmpty(e.degree)),
    certifications: r.certifications.filter(nonEmpty),
    contact: { ...r.contact, links: r.contact.links.filter((l) => nonEmpty(l.url)) },
  };
}

export type ValidationResult =
  | { ok: true; resume: Resume }
  | { ok: false; errors: Record<string, string> };

const FRIENDLY: Record<string, string> = {
  "contact.fullName": "Add your full name",
  "contact.email": "Enter a valid email address",
};

/** Clean + validate; returns field-keyed, human-readable errors for the UI. */
export function validateResume(r: Resume): ValidationResult {
  const cleaned = cleanResume(r);
  const res = resumeSchema.safeParse(cleaned);
  if (res.success) return { ok: true, resume: res.data };
  const errors: Record<string, string> = {};
  for (const i of res.error.issues) {
    const key = i.path.join(".");
    errors[key] ??= FRIENDLY[key] ?? i.message;
  }
  return { ok: false, errors };
}
