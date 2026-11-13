import { looseResume, obj, str } from "./loose";
import type { Resume } from "./schema";

/**
 * What a resume was made for. Stored inside the resume's own saved data, so it is saved, synced and deleted
 * together with it. Everything here is untrusted when loaded (older versions, manual edits, another device).
 */
export const JOB_STATUSES = ["saved", "applied", "interview", "offer", "rejected"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const STATUS_LABEL: Record<JobStatus, string> = { saved: "Saved", applied: "Applied", interview: "Interview", offer: "Offer", rejected: "Rejected" };

export interface JobInfo {
  title: string;
  company: string;
  /** where the posting was (http/https only), or "" */
  url: string;
  status: JobStatus;
  note: string;
  createdAt: number;
  /** when it was marked Applied, or null */
  appliedAt: number | null;
  /** short fingerprint of the job description this resume was made from: "Create again" on the same job keeps one resume */
  fp: string;
}

/** An earlier version of this resume, kept when it is made again for the same job. */
export interface ResumeVersion {
  at: number;
  label: string;
  resume: Resume;
}
export const MAX_VERSIONS = 3;

/** A small stable fingerprint (not a security hash) of a job description, ignoring spacing and case. */
export function jdFingerprint(jd: string): string {
  const t = jd.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return `${t.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

const safeUrl = (v: unknown) => {
  const s = str(v, 300).trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : "";
};
const ts = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 4_102_444_800_000 ? Math.floor(v) : null);

export function parseJob(raw: unknown): JobInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const o = obj(raw);
  const title = str(o.title, 100).trim();
  const company = str(o.company, 100).trim();
  const status = (JOB_STATUSES as readonly string[]).includes(o.status as string) ? (o.status as JobStatus) : "saved";
  const createdAt = ts(o.createdAt) ?? 0;
  return { title, company, url: safeUrl(o.url), status, note: str(o.note, 500), createdAt, appliedAt: ts(o.appliedAt), fp: str(o.fp, 30) };
}

export function parseVersions(raw: unknown): ResumeVersion[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_VERSIONS).map((v) => {
    const o = obj(v);
    return { at: ts(o.at) ?? 0, label: str(o.label, 60), resume: looseResume(o.resume) };
  });
}

/** "Senior Engineer at Acme", "Senior Engineer", "Acme" or "Untitled job". */
export function jobName(j: Pick<JobInfo, "title" | "company">): string {
  const t = j.title.trim();
  const c = j.company.trim();
  return t && c ? `${t} at ${c}` : t || c || "Untitled job";
}

const GENERIC_FIRST_LINES = /^(?:about (?:the )?(?:job|role|us|position)|job (?:description|details|summary|overview)|overview|description|responsibilities|requirements|we are (?:hiring|looking)|who we are|apply now|position summary|role overview|the role)\b/i;

/** A guess at the job title from the first line of a pasted posting, or "". The person can always change it. */
export function guessJobTitle(jd: string): string {
  for (const raw of jd.split(/\r?\n/).slice(0, 6)) {
    const line = raw.replace(/^(?:job title|position|role|title)\s*[:\-–—]\s*/i, "").replace(/^[#*\-•\s]+|[*\s]+$/g, "").trim();
    if (!line) continue;
    if (line.length > 80 || line.split(/\s+/).length > 10 || /[.!?]$/.test(line) || /^\d+$/.test(line) || GENERIC_FIRST_LINES.test(line)) return "";
    return line.slice(0, 100);
  }
  return "";
}
