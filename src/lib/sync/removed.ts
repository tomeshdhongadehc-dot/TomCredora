import { isResumeId, type StorageLike } from "../workspace";

/**
 * The record of resumes deleted on this device, kept apart from the rest of the sync code on purpose: the data hooks
 * (on every editing page) need only this, and must not pull in the merge logic just to note a delete.
 */
export const REMOVED_KEY = "arb.removed.v1";
export const MAX_REMOVED = 100;

const read = (s: StorageLike): unknown => {
  try {
    const v = s.getItem(REMOVED_KEY);
    return v === null ? null : JSON.parse(v);
  } catch {
    return null;
  }
};

export function readRemoved(s: StorageLike): Record<string, number> {
  const raw = read(s);
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [id, t] of Object.entries(raw)) if (isResumeId(id) && typeof t === "number" && Number.isFinite(t) && t >= 0) out[id] = t;
  }
  return out;
}

export function writeRemoved(s: StorageLike, removed: Record<string, number>): void {
  try {
    s.setItem(REMOVED_KEY, JSON.stringify(Object.fromEntries(Object.entries(removed).sort(([, a], [, b]) => b - a).slice(0, MAX_REMOVED))));
  } catch {
    /* storage full or blocked: nothing more to do */
  }
}

/** Remember that a resume was deleted here, so a sync does not bring it back from another device. */
export function recordRemoval(s: StorageLike, id: string, now = Date.now()): void {
  writeRemoved(s, { ...readRemoved(s), [id]: now });
}
