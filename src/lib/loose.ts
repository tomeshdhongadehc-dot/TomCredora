import { newId } from "./ids";
import { LIMITS, SCHEMA_VERSION, type Resume } from "./schema";

/**
 * Lenient loading for data that is allowed to be unfinished (a resume or profile being filled in: no email yet,
 * a half-typed link). Anything stored or imported goes through here instead of the strict schema, which would
 * throw away the WHOLE resume for one missing field. Strict validation happens when the data is used (AI, export).
 */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
export const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CONTROL, "").slice(0, max) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strs = (v: unknown, n: number, max: number) => arr(v).slice(0, n).map((x) => str(x, max)).filter(Boolean);

/** Rebuild a resume from untrusted stored data without rejecting it for being unfinished. */
export function looseResume(raw: unknown): Resume {
  const r = obj(raw);
  const c = obj(r.contact);
  return {
    schemaVersion: SCHEMA_VERSION,
    contact: {
      fullName: str(c.fullName, 80),
      headline: str(c.headline, 100),
      email: str(c.email, 120),
      phone: str(c.phone, 30),
      location: str(c.location, 80),
      links: arr(c.links).slice(0, 5).map((l) => ({ label: str(obj(l).label, 30), url: str(obj(l).url, 200) })),
    },
    summary: str(r.summary, 600),
    skills: arr(r.skills).slice(0, 8).map((g) => ({ label: str(obj(g).label, 40), items: strs(obj(g).items, 25, 40) })),
    experience: arr(r.experience).slice(0, LIMITS.roles).map((e) => {
      const o = obj(e);
      return { id: str(o.id, 40) || newId(), company: str(o.company, 100), role: str(o.role, 100), location: str(o.location, 80), start: str(o.start, 20), end: str(o.end, 20), bullets: strs(o.bullets, LIMITS.bulletsPerRole, LIMITS.bullet) };
    }),
    projects: arr(r.projects).slice(0, 8).map((p) => {
      const o = obj(p);
      return { id: str(o.id, 40) || newId(), name: str(o.name, 100), link: str(o.link, 200), tech: strs(o.tech, 15, 40), bullets: strs(o.bullets, 5, LIMITS.bullet) };
    }),
    education: arr(r.education).slice(0, 5).map((e) => {
      const o = obj(e);
      return { id: str(o.id, 40) || newId(), school: str(o.school, 120), degree: str(o.degree, 120), start: str(o.start, 20), end: str(o.end, 20), details: str(o.details, 200) };
    }),
    certifications: strs(r.certifications, 10, 120),
  };
}
