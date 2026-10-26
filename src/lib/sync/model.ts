import { z } from "zod";
import { parseDraft, type Draft } from "../draft-model";
import { parseProfile, type Profile } from "../profile";
import { MAX_RESUMES, cleanResumeName, isResumeId } from "../workspace";
import { MAX_REMOVED } from "./removed";

/**
 * Everything a person has, as one document: the profile, every resume, and a record of which resumes were deleted
 * (so a delete on one device is not undone by another). It is merged, never overwritten, so nothing is lost when
 * two devices have changed things.
 */
export interface SyncResume {
  id: string;
  name: string;
  updatedAt: number;
  draft: Draft;
}
export interface Snapshot {
  v: 1;
  profile: { updatedAt: number; data: Profile } | null;
  resumes: SyncResume[];
  /** resume id -> when it was deleted */
  removed: Record<string, number>;
}

export { MAX_REMOVED };
export const MAX_SNAPSHOT_BYTES = 1_000_000;
export const emptySnapshot = (): Snapshot => ({ v: 1, profile: null, resumes: [], removed: {} });

const ts = z.number().int().min(0).max(4_102_444_800_000); // before the year 2100
const resumeId = z.string().refine(isResumeId, "bad id");

/** The wire format. Contents (`draft`, `data`) are validated leniently by sanitizeSnapshot, never trusted as is. */
export const snapshotSchema = z.strictObject({
  v: z.literal(1),
  profile: z.strictObject({ updatedAt: ts, data: z.unknown() }).nullable(),
  resumes: z.array(z.strictObject({ id: resumeId, name: z.string().max(200), updatedAt: ts, draft: z.unknown() })).max(MAX_RESUMES),
  removed: z.record(resumeId, ts).refine((o) => Object.keys(o).length <= MAX_REMOVED, "too many removed entries"),
});

/** Turn untrusted wire data into a clean snapshot: sanitised contents, no duplicate ids, names fixed up. */
export function sanitizeSnapshot(raw: z.infer<typeof snapshotSchema>): Snapshot {
  const byId = new Map<string, SyncResume>();
  for (const r of raw.resumes) {
    const clean: SyncResume = { id: r.id, name: cleanResumeName(r.name) || "Resume", updatedAt: r.updatedAt, draft: parseDraft(r.draft) };
    const cur = byId.get(r.id);
    if (!cur || clean.updatedAt >= cur.updatedAt) byId.set(r.id, clean);
  }
  return { v: 1, profile: raw.profile ? { updatedAt: raw.profile.updatedAt, data: parseProfile(raw.profile.data) } : null, resumes: [...byId.values()], removed: { ...raw.removed } };
}

/** A canonical form (sorted, stable) so two snapshots can be compared and merges are deterministic. */
export function normalize(s: Snapshot): Snapshot {
  const removed = Object.fromEntries(Object.entries(s.removed).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { v: 1, profile: s.profile, resumes: [...s.resumes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), removed };
}
export const sameSnapshot = (a: Snapshot, b: Snapshot) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

/** Newer wins; on an exact tie pick by content so that merge(a, b) and merge(b, a) always agree. */
const newer = <T extends { updatedAt: number }>(a: T, b: T): T => (a.updatedAt !== b.updatedAt ? (a.updatedAt > b.updatedAt ? a : b) : JSON.stringify(a) >= JSON.stringify(b) ? a : b);

/**
 * Merge two snapshots without losing anything:
 *  - a resume on only one side is kept; on both sides the more recently edited copy wins;
 *  - a delete wins over an older copy, but an edit made AFTER the delete brings the resume back;
 *  - the profile is the more recently changed of the two.
 * It is commutative (order does not matter) and idempotent (merging again changes nothing), so devices converge.
 */
export function mergeSnapshots(a: Snapshot, b: Snapshot): Snapshot {
  const removed: Record<string, number> = { ...a.removed };
  for (const [id, t] of Object.entries(b.removed)) removed[id] = Math.max(removed[id] ?? 0, t);

  const best = new Map<string, SyncResume>();
  for (const r of [...a.resumes, ...b.resumes]) {
    const cur = best.get(r.id);
    best.set(r.id, cur ? newer(cur, r) : r);
  }

  let kept: SyncResume[] = [];
  for (const r of best.values()) {
    const gone = removed[r.id];
    if (gone === undefined || gone < r.updatedAt) {
      if (gone !== undefined) delete removed[r.id]; // edited after it was deleted: it is back
      kept.push(r);
    }
  }
  kept.sort((x, y) => y.updatedAt - x.updatedAt || (x.id < y.id ? -1 : 1));
  if (kept.length > MAX_RESUMES) {
    // Over the limit: the oldest are dropped, and recorded as removed so no device brings them back.
    for (const r of kept.slice(MAX_RESUMES)) removed[r.id] = Math.max(removed[r.id] ?? 0, r.updatedAt);
    kept = kept.slice(0, MAX_RESUMES);
  }
  const trimmed = Object.entries(removed).sort(([, x], [, y]) => y - x).slice(0, MAX_REMOVED);

  const profile = a.profile && b.profile ? newer(a.profile, b.profile) : (a.profile ?? b.profile);
  return normalize({ v: 1, profile, resumes: kept, removed: Object.fromEntries(trimmed) });
}
