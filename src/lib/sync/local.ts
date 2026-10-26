import { hasContent } from "../draft-model";
import { PROFILE_AT_KEY, loadProfile, profileHasContent, saveProfileRaw, seededKey } from "../profile";
import { MAX_RESUMES, dataKey, loadDraft, parseIndex, saveDraft, saveIndex, INDEX_KEY, type StorageLike, type WorkspaceIndex } from "../workspace";
import { emptySnapshot, sameSnapshot, type Snapshot, type SyncResume } from "./model";
import { readRemoved, writeRemoved } from "./removed";

/** Reading and writing a Snapshot to this browser's storage. Pure functions over a storage object, so they are testable. */

const read = (s: StorageLike, key: string): unknown => {
  try {
    const v = s.getItem(key);
    return v === null ? null : JSON.parse(v);
  } catch {
    return null;
  }
};

const isEmptyDraft = (d: { resume: Parameters<typeof hasContent>[0]; jd: string }) => !hasContent(d.resume) && !d.jd.trim();

/**
 * What this browser has, as a snapshot. A resume with nothing in it is left out: every new device starts with an
 * empty default resume, and that must not be uploaded or shown next to a person's real ones.
 */
export function readLocalSnapshot(s: StorageLike): Snapshot {
  const index = parseIndex(read(s, INDEX_KEY));
  const resumes: SyncResume[] = [];
  for (const item of index?.items ?? []) {
    const draft = loadDraft(s, item.id);
    if (!draft || isEmptyDraft(draft)) continue;
    resumes.push({ id: item.id, name: item.name, updatedAt: item.updatedAt, draft });
  }
  const profile = loadProfile(s);
  const stampRaw = Number(s.getItem(PROFILE_AT_KEY));
  return {
    ...emptySnapshot(),
    profile: profileHasContent(profile) ? { updatedAt: Number.isFinite(stampRaw) && stampRaw > 0 ? stampRaw : 1, data: profile } : null,
    resumes,
    removed: readRemoved(s),
  };
}

/**
 * Write a merged snapshot into this browser.
 *  - every resume in the snapshot is stored; resumes the snapshot says were deleted are removed here;
 *  - this browser's empty resumes are kept, except on a fresh device where they are only the empty default;
 *  - the open resume stays open if it still exists.
 * Returns whether anything changed.
 */
export function applySnapshot(s: StorageLike, snap: Snapshot): { changed: boolean; activeChanged: boolean } {
  const before = readLocalSnapshot(s);
  const index: WorkspaceIndex = parseIndex(read(s, INDEX_KEY)) ?? { activeId: "", items: [] };

  const localEmpty = index.items.filter((i) => {
    const d = loadDraft(s, i.id);
    return !d || isEmptyDraft(d);
  });
  const freshDevice = localEmpty.length === index.items.length;

  const inSnap = new Set(snap.resumes.map((r) => r.id));
  const items = [...snap.resumes].sort((a, b) => b.updatedAt - a.updatedAt).map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt }));
  for (const r of snap.resumes) {
    saveDraft(s, r.id, r.draft);
    try {
      s.setItem(seededKey(r.id), "1"); // a synced resume is never auto-seeded from the profile
    } catch {
      /* ignore */
    }
  }
  if (!freshDevice) for (const i of localEmpty) if (!inSnap.has(i.id) && items.length < MAX_RESUMES) items.push(i);

  // Resumes that were here but are no longer part of the account: delete their data.
  for (const i of index.items) {
    if (!items.some((x) => x.id === i.id)) {
      try {
        s.removeItem(dataKey(i.id));
      } catch {
        /* ignore */
      }
    }
  }

  const activeId = items.some((i) => i.id === index.activeId) ? index.activeId : (items[0]?.id ?? "");
  if (items.length) saveIndex(s, { activeId, items });
  else {
    try {
      s.removeItem(INDEX_KEY); // loadWorkspace will make a fresh empty resume
    } catch {
      /* ignore */
    }
  }

  if (snap.profile) saveProfileRaw(s, snap.profile.data, snap.profile.updatedAt);
  const removed = { ...readRemoved(s) };
  for (const [id, t] of Object.entries(snap.removed)) removed[id] = Math.max(removed[id] ?? 0, t);
  writeRemoved(s, removed);

  const after = readLocalSnapshot(s);
  return { changed: !sameSnapshot(before, after) || index.activeId !== activeId, activeChanged: index.activeId !== activeId };
}
