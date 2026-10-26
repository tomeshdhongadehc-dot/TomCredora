import { newId } from "./ids";
import { looseResume } from "./loose";
import { reviewSchema, type ReviewState } from "./review-state";
import { SCHEMA_VERSION, type Resume } from "./schema";
import { DEFAULT_CONFIG, parseConfig, type TemplateConfig } from "./templates";

export const emptyResume = (): Resume => ({
  schemaVersion: SCHEMA_VERSION,
  contact: { fullName: "", headline: "", email: "", phone: "", location: "", links: [] },
  summary: "",
  skills: [{ label: "Skills", items: [] }],
  experience: [],
  projects: [],
  education: [],
  certifications: [],
});

/** Everything about one resume that is saved together. */
export interface Draft {
  resume: Resume;
  jd: string;
  template: TemplateConfig;
  /** pending AI confirmations; null before any AI pass */
  review: ReviewState | null;
}

export const emptyDraft = (): Draft => ({ resume: emptyResume(), jd: "", template: DEFAULT_CONFIG, review: null });

export { newId };

export const MAX_JD_CHARS = 12_000;

/** Stored or imported data is untrusted (older versions, manual edits): validate every part, fall back per part. */
export function parseDraft(raw: unknown): Draft {
  const j = (raw && typeof raw === "object" ? raw : {}) as { resume?: unknown; jd?: unknown; template?: unknown; review?: unknown };
  const review = reviewSchema.safeParse(j.review);
  return {
    // Lenient on purpose: an unfinished resume (no email yet) must survive a reload, not be replaced by an empty one.
    resume: looseResume(j.resume),
    jd: typeof j.jd === "string" ? j.jd.slice(0, MAX_JD_CHARS) : "",
    template: parseConfig(j.template),
    review: review.success ? review.data : null,
  };
}

/** Did the user put anything into this resume? (Used to decide whether replacing it needs care.) */
export const hasContent = (r: Resume) =>
  !!(r.contact.fullName || r.contact.email || r.summary || r.experience.length || r.education.length || r.projects.length || r.certifications.length || r.skills.some((g) => g.items.length));
