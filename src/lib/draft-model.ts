import { newId } from "./ids";
import { looseResume } from "./loose";
import { parseJob, parseVersions, type JobInfo, type ResumeVersion } from "./job-model";
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
  /** the job this resume was made for (null for a general resume) */
  job: JobInfo | null;
  /** earlier versions, newest first, kept when the resume is made again for the same job */
  versions: ResumeVersion[];
  /** the cover letter written for this job, as the person left it */
  letter: string;
}

export const emptyDraft = (): Draft => ({ resume: emptyResume(), jd: "", template: DEFAULT_CONFIG, review: null, job: null, versions: [], letter: "" });

export { newId };

export const MAX_JD_CHARS = 12_000;
export const MAX_LETTER_CHARS = 8_000;

/** Stored or imported data is untrusted (older versions, manual edits): validate every part, fall back per part. */
export function parseDraft(raw: unknown): Draft {
  const j = (raw && typeof raw === "object" ? raw : {}) as { resume?: unknown; jd?: unknown; template?: unknown; review?: unknown; job?: unknown; versions?: unknown; letter?: unknown };
  const review = reviewSchema.safeParse(j.review);
  return {
    // Lenient on purpose: an unfinished resume (no email yet) must survive a reload, not be replaced by an empty one.
    resume: looseResume(j.resume),
    jd: typeof j.jd === "string" ? j.jd.slice(0, MAX_JD_CHARS) : "",
    template: parseConfig(j.template),
    review: review.success ? review.data : null,
    job: parseJob(j.job),
    versions: parseVersions(j.versions),
    letter: typeof j.letter === "string" ? j.letter.slice(0, MAX_LETTER_CHARS) : "",
  };
}

/** Did the user put anything into this resume? (Used to decide whether replacing it needs care.) */
export const hasContent = (r: Resume) =>
  !!(r.contact.fullName || r.contact.email || r.summary || r.experience.length || r.education.length || r.projects.length || r.certifications.length || r.skills.some((g) => g.items.length));
