import { parseDraft, type Draft } from "./draft-model";
import { JOB_STATUSES, type JobInfo, type JobStatus } from "./job-model";
import { notifyLocalChange } from "./sync/bus";
import { INDEX_KEY, dataKey, loadDraft, parseIndex, removeResume, saveDraft, saveIndex, touchResume, type StorageLike } from "./workspace";
import { recordRemoval } from "./sync/removed";

/**
 * The saved applications: every resume that was made for a job. Straight functions over a storage object (no
 * React), so the Applications page and the tests use the same code. The job details live inside each resume's own
 * saved data, so they are saved, synced and deleted together with it.
 */

export interface JobRow {
  id: string;
  /** the resume's name */
  name: string;
  updatedAt: number;
  job: JobInfo;
  hasResume: boolean;
  versions: number;
}

const readIndex = (s: StorageLike) => {
  try {
    const v = s.getItem(INDEX_KEY);
    return v === null ? null : parseIndex(JSON.parse(v));
  } catch {
    return null;
  }
};

/** Resumes that were made for a job, newest first. */
export function listJobs(s: StorageLike): JobRow[] {
  const index = readIndex(s);
  if (!index) return [];
  const rows: JobRow[] = [];
  for (const item of index.items) {
    const d = loadDraft(s, item.id);
    if (!d?.job) continue;
    rows.push({ id: item.id, name: item.name, updatedAt: item.updatedAt, job: d.job, hasResume: d.resume.experience.length + d.resume.skills.reduce((n, g) => n + g.items.length, 0) > 0, versions: d.versions.length });
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const countByStatus = (rows: JobRow[]): Record<JobStatus | "all", number> => {
  const c = { all: rows.length, saved: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
  for (const r of rows) c[r.job.status]++;
  return c;
};

/** Change a resume's job details (status, note, title, company, link). Marking "applied" stamps the date once. */
export function updateJob(s: StorageLike, id: string, patch: Partial<Pick<JobInfo, "title" | "company" | "url" | "status" | "note">>, now = Date.now()): boolean {
  const index = readIndex(s);
  const d: Draft | null = index?.items.some((i) => i.id === id) ? loadDraft(s, id) : null;
  if (!index || !d?.job) return false;
  const status = patch.status && (JOB_STATUSES as readonly string[]).includes(patch.status) ? patch.status : d.job.status;
  const next = parseDraft({ ...d, job: { ...d.job, ...patch, status, appliedAt: status !== "saved" && d.job.appliedAt === null ? now : d.job.appliedAt } });
  if (!next.job) return false;
  if (!saveDraft(s, id, { ...d, job: next.job })) return false;
  saveIndex(s, touchResume(index, id, now));
  notifyLocalChange();
  return true;
}

/** Make this resume the one the workspace opens. */
export function openJob(s: StorageLike, id: string): boolean {
  const index = readIndex(s);
  if (!index || !index.items.some((i) => i.id === id)) return false;
  return saveIndex(s, { ...index, activeId: id });
}

/** Delete a saved application (and its resume). The last resume in the browser cannot be deleted. */
export function deleteJob(s: StorageLike, id: string): boolean {
  const index = readIndex(s);
  const next = index ? removeResume(index, id) : null;
  if (!next) return false;
  s.removeItem(dataKey(id));
  recordRemoval(s, id); // so another device does not bring it back
  saveIndex(s, next);
  notifyLocalChange();
  return true;
}

/** Stop tracking a resume as a job but keep the resume itself. */
export function clearJob(s: StorageLike, id: string, now = Date.now()): boolean {
  const index = readIndex(s);
  const d = index?.items.some((i) => i.id === id) ? loadDraft(s, id) : null;
  if (!index || !d?.job) return false;
  if (!saveDraft(s, id, { ...d, job: null })) return false;
  saveIndex(s, touchResume(index, id, now));
  notifyLocalChange();
  return true;
}
