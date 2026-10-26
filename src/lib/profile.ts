import { newId } from "./ids";
import { looseResume, obj, str } from "./loose";
import type { Resume } from "./schema";
import type { StorageLike } from "./workspace";

/**
 * The profile: the details that stay the same for every job. Resumes are seeded from it, and tailoring is
 * done on a copy, so the profile itself is never rewritten by the AI.
 *
 * It has the same shape as a resume, but it is allowed to be incomplete while it is being filled in (no email
 * yet, a half-typed link), so it is loaded leniently and fully validated only when it is used.
 */
export interface Profile {
  /** which field-of-work family drives the quick-pick suggestions ("" until chosen) */
  focus: string;
  resume: Resume;
}

export { looseResume };

export const PROFILE_KEY = "arb.profile.v1";
/** When the profile was last changed here (ms), so a sync can tell which copy is newer. */
export const PROFILE_AT_KEY = "arb.profile.at.v1";
/** Marks a resume that was already seeded, so clearing it by hand does not make it refill. */
export const seededKey = (resumeId: string) => `arb.seeded.${resumeId}`;

export const emptyProfile = (): Profile => ({ focus: "", resume: looseResume({}) });

export function parseProfile(raw: unknown): Profile {
  const o = obj(raw);
  return { focus: str(o.focus, 30), resume: looseResume(o.resume) };
}

export function loadProfile(s: StorageLike): Profile | null {
  try {
    const v = s.getItem(PROFILE_KEY);
    return v === null ? null : parseProfile(JSON.parse(v));
  } catch {
    return null;
  }
}

export function saveProfile(s: StorageLike, p: Profile): void {
  saveProfileRaw(s, p, Date.now());
}

/** Save with an explicit "last changed" time (used when a synced copy is written, which keeps the original time). */
export function saveProfileRaw(s: StorageLike, p: Profile, changedAt: number): void {
  try {
    s.setItem(PROFILE_KEY, JSON.stringify(p));
    s.setItem(PROFILE_AT_KEY, String(changedAt));
  } catch {
    /* storage full or blocked: the in-memory profile still works for this visit */
  }
}

/** Did the user put anything in? (A profile with only a chosen field does not count.) */
export const profileHasContent = (p: Profile | null): p is Profile => {
  if (!p) return false;
  const r = p.resume;
  return !!(r.contact.fullName || r.contact.email || r.experience.length || r.education.length || r.projects.length || r.certifications.length || r.skills.some((g) => g.items.length));
};

/**
 * A new resume's starting content: a copy of the profile with fresh ids. The summary is left empty on purpose:
 * writing it (and sharpening the bullets for a job) is the AI's part, not the profile's.
 */
export function seedFromProfile(p: Profile): Resume {
  const r = looseResume(p.resume);
  return {
    ...r,
    summary: "",
    experience: r.experience.map((e) => ({ ...e, id: newId() })),
    projects: r.projects.map((x) => ({ ...x, id: newId() })),
    education: r.education.map((e) => ({ ...e, id: newId() })),
  };
}

/** The reverse: use an existing resume's details as the profile (people who filled a resume in before profiles existed). */
export const profileFromResume = (r: Resume, focus = ""): Profile => ({ focus, resume: { ...looseResume(r), summary: "" } });

export interface Completeness {
  pct: number;
  /** what would raise it, in the order to do it */
  missing: string[];
}

/** A friendly progress measure, not a validity check: each part is worth a share. */
export function completeness(p: Profile): Completeness {
  const r = p.resume;
  const skillCount = r.skills.reduce((n, g) => n + g.items.length, 0);
  const parts: [string, number, boolean][] = [
    ["Your name", 10, !!r.contact.fullName],
    ["Your email", 10, !!r.contact.email],
    ["Phone or city", 5, !!(r.contact.phone || r.contact.location)],
    ["A profile link (LinkedIn or GitHub)", 5, r.contact.links.some((l) => l.url)],
    ["At least 5 skills", 20, skillCount >= 5],
    ["A job or internship", 20, r.experience.some((e) => e.role || e.company)],
    ["2 things you did in it", 15, r.experience.some((e) => e.bullets.length >= 2)],
    ["Your education", 15, r.education.some((e) => e.school || e.degree)],
  ];
  const pct = parts.reduce((n, [, w, ok]) => n + (ok ? w : 0), 0);
  return { pct, missing: parts.filter(([, , ok]) => !ok).map(([l]) => l) };
}
