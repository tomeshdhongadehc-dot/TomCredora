import { emptyDraft, parseDraft, type Draft } from "./draft-model";
import { SAMPLE_RESUME } from "./sample";
import { resumeSchema } from "./schema";

/**
 * Multiple resumes in one browser. Pure functions over a storage-like object, so the logic is testable
 * without a browser. The index lists the resumes; each resume's data lives under its own key so that
 * saving one never rewrites the others.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ResumeMeta {
  id: string;
  name: string;
  updatedAt: number;
}
export interface WorkspaceIndex {
  activeId: string;
  items: ResumeMeta[];
}

export const MAX_RESUMES = 20;
export const MAX_NAME = 60;
export const INDEX_KEY = "arb.workspace.v1";
export const LEGACY_KEY = "arb.draft.v1";
export const dataKey = (id: string) => `arb.resume.${id}`;
export const newResumeId = () => `r-${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;
export const isResumeId = (id: unknown): id is string => typeof id === "string" && /^r-[a-z0-9]{4,12}$/.test(id);

export const cleanResumeName = (s: string) =>
  s.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);

/** Keep only well-formed, unique entries and make sure the active id points at one of them. */
export function parseIndex(raw: unknown): WorkspaceIndex | null {
  if (!raw || typeof raw !== "object") return null;
  const { activeId, items } = raw as { activeId?: unknown; items?: unknown };
  if (!Array.isArray(items)) return null;
  const seen = new Set<string>();
  const clean: ResumeMeta[] = [];
  for (const it of items) {
    if (clean.length >= MAX_RESUMES || !it || typeof it !== "object") continue;
    const { id, name, updatedAt } = it as Record<string, unknown>;
    const n = typeof name === "string" ? cleanResumeName(name) : "";
    if (!isResumeId(id) || seen.has(id) || !n) continue;
    seen.add(id);
    clean.push({ id, name: n, updatedAt: typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : 0 });
  }
  if (!clean.length) return null;
  return { activeId: isResumeId(activeId) && seen.has(activeId) ? activeId : clean[0].id, items: clean };
}

const read = (s: StorageLike, key: string): unknown => {
  try {
    const v = s.getItem(key);
    return v === null ? null : JSON.parse(v);
  } catch {
    return null;
  }
};
const write = (s: StorageLike, key: string, value: unknown): boolean => {
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full or blocked: the app keeps working in memory
  }
};

export const saveIndex = (s: StorageLike, index: WorkspaceIndex) => write(s, INDEX_KEY, index);
export const saveDraft = (s: StorageLike, id: string, draft: Draft) => write(s, dataKey(id), draft);

export function loadDraft(s: StorageLike, id: string): Draft | null {
  const raw = read(s, dataKey(id));
  return raw === null ? null : parseDraft(raw);
}

/**
 * Load the workspace. A first-time visitor gets one empty resume; someone upgrading from the single-draft
 * version gets their existing draft moved into a resume called "My resume" (the old key is left in place as a backup).
 */
export function loadWorkspace(s: StorageLike, now = Date.now()): { index: WorkspaceIndex; draft: Draft } {
  const stored = parseIndex(read(s, INDEX_KEY));
  if (stored) {
    const d = loadDraft(s, stored.activeId);
    if (d) return { index: stored, draft: d };
    return { index: stored, draft: emptyDraft() }; // data key missing or unreadable: start that resume empty
  }
  const id = newResumeId();
  const legacy = read(s, LEGACY_KEY);
  const draft = legacy ? parseDraft(legacy) : emptyDraft();
  const index: WorkspaceIndex = { activeId: id, items: [{ id, name: legacy ? "My resume" : "Untitled resume", updatedAt: now }] };
  saveIndex(s, index);
  saveDraft(s, id, draft);
  return { index, draft };
}

/** A name that is not already taken: "Resume", "Resume 2", "Resume 3"... */
export function uniqueName(items: ResumeMeta[], wanted: string): string {
  const base = cleanResumeName(wanted) || "Untitled resume";
  const taken = new Set(items.map((i) => i.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base.slice(0, MAX_NAME - 4)} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

export const addResume = (index: WorkspaceIndex, name: string, now = Date.now()): { index: WorkspaceIndex; id: string } | null => {
  if (index.items.length >= MAX_RESUMES) return null;
  const id = newResumeId();
  return { id, index: { activeId: id, items: [...index.items, { id, name: uniqueName(index.items, name), updatedAt: now }] } };
};

export const renameResume = (index: WorkspaceIndex, id: string, name: string): WorkspaceIndex => {
  const n = cleanResumeName(name);
  if (!n) return index;
  const others = index.items.filter((i) => i.id !== id);
  return { ...index, items: index.items.map((i) => (i.id === id ? { ...i, name: uniqueName(others, n) } : i)) };
};

export const touchResume = (index: WorkspaceIndex, id: string, now = Date.now()): WorkspaceIndex => ({
  ...index,
  items: index.items.map((i) => (i.id === id ? { ...i, updatedAt: now } : i)),
});

/** Remove a resume. The last one cannot be removed; removing the active one activates its neighbour. */
export function removeResume(index: WorkspaceIndex, id: string): WorkspaceIndex | null {
  if (index.items.length <= 1 || !index.items.some((i) => i.id === id)) return null;
  const pos = index.items.findIndex((i) => i.id === id);
  const items = index.items.filter((i) => i.id !== id);
  const activeId = index.activeId === id ? items[Math.min(pos, items.length - 1)].id : index.activeId;
  return { activeId, items };
}

// ---------- import / export ----------

export const EXPORT_FORMAT = "tomcredora-resume";
export const MAX_IMPORT_BYTES = 1_000_000;

export function exportBundle(name: string, draft: Draft): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, name, resume: draft.resume, template: draft.template, jd: draft.jd }, null, 2);
}

export type ImportResult = { ok: true; name: string; draft: Draft } | { ok: false; error: string };

/**
 * Accepts a TomCredora backup ({format, resume, template, jd}), the older "Backup (.json)" ({resume, template}),
 * or a bare resume object. Everything is validated; nothing from the file is trusted.
 */
export function parseImport(text: string, fallbackName = "Imported resume"): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: "That file is too large to be a resume backup." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "That file is not a resume backup." };
  const o = raw as Record<string, unknown>;
  const looksLikeBundle = "resume" in o;
  const candidate = looksLikeBundle ? o : { resume: o };
  const draft = parseDraft({ ...candidate, review: null }); // pending AI confirmations belong to the original session, not the import
  // Stored drafts load leniently (unfinished work must survive a reload), but a file from outside has to be a real
  // resume: a name and a valid email, within the schema limits. Unknown fields were already dropped by the lenient load.
  if (!resumeSchema.safeParse(draft.resume).success) return { ok: false, error: "No valid resume found in that file (a name and a valid email are required)." };
  const name = typeof o.name === "string" && cleanResumeName(o.name) ? cleanResumeName(o.name) : fallbackName;
  return { ok: true, name, draft };
}

/** A copy of a draft with fresh item ids so the copy never shares ids with the original. */
export function cloneDraft(d: Draft): Draft {
  const fresh = () => Math.random().toString(36).slice(2, 10);
  const c = structuredClone(d);
  c.resume.experience.forEach((e) => (e.id = fresh()));
  c.resume.projects.forEach((p) => (p.id = fresh()));
  c.resume.education.forEach((e) => (e.id = fresh()));
  c.review = null; // ledger entries reference the old role ids
  return c;
}

export const exampleDraft = (): Draft => ({ ...emptyDraft(), resume: structuredClone(SAMPLE_RESUME) });
