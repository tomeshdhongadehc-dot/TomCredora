import { applySnapshot, readLocalSnapshot } from "./local";
import { mergeSnapshots, sameSnapshot, sanitizeSnapshot, snapshotSchema, type Snapshot } from "./model";
import type { StorageLike } from "../workspace";

export type SyncStatus =
  | { state: "synced"; at: number; pulled: boolean; pushed: boolean }
  | { state: "signed-out" }
  | { state: "offline" }
  | { state: "unavailable" }
  | { state: "error"; message: string };

export interface SyncDeps {
  storage: StorageLike;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** the signed-in user's access token */
  token: () => string | null | Promise<string | null>;
  /** write any edit that is still waiting to be saved, so the sync sees it */
  flush?: () => void;
  now?: () => number;
  url?: string;
  maxRounds?: number;
}

const isEmpty = (s: Snapshot) => !s.profile && !s.resumes.length && !Object.keys(s.removed).length;

/**
 * One sync: read the cloud copy, merge it with this browser's data, write the merge back to this browser if it
 * changed what is here, and save it to the cloud if it changed what is there. Safe to run any time and as often
 * as you like: when nothing changed it does nothing, and a second device doing the same converges on the same data.
 *
 * Two safety rules:
 *  - it never writes over an edit made while it was waiting for the network (it starts the round again instead);
 *  - if another device saved in between (version conflict) it re-reads, re-merges and tries again.
 */
export async function syncOnce(d: SyncDeps): Promise<SyncStatus> {
  const url = d.url ?? "/api/v1/sync";
  const token = await d.token();
  if (!token) return { state: "signed-out" };
  const auth = { authorization: `Bearer ${token}` };
  let pulled = false;
  let pushed = false;

  try {
    for (let round = 0; round < (d.maxRounds ?? 5); round++) {
      d.flush?.();
      const local = readLocalSnapshot(d.storage);

      const got = await d.fetch(url, { method: "GET", headers: auth, cache: "no-store" });
      if (got.status === 401) return { state: "signed-out" };
      if (got.status === 501) return { state: "unavailable" };
      let remote: { snapshot: Snapshot; version: number } | null = null;
      if (got.status === 200) {
        const j = (await got.json()) as { snapshot?: unknown; version?: unknown };
        const parsed = snapshotSchema.safeParse(j.snapshot);
        if (!parsed.success || typeof j.version !== "number") return { state: "error", message: "The saved data could not be read." };
        remote = { snapshot: sanitizeSnapshot(parsed.data), version: j.version };
      } else if (got.status !== 404) {
        return { state: "error", message: "Could not reach your account. Try again in a moment." };
      }

      const merged = remote ? mergeSnapshots(local, remote.snapshot) : local;

      if (!sameSnapshot(merged, local)) {
        // Only write if nothing was edited here while we waited; otherwise start the round again.
        d.flush?.();
        if (!sameSnapshot(readLocalSnapshot(d.storage), local)) continue;
        pulled = applySnapshot(d.storage, merged).changed || pulled;
      }

      const needsPush = remote ? !sameSnapshot(merged, remote.snapshot) : !isEmpty(merged);
      if (needsPush) {
        const put = await d.fetch(url, {
          method: "PUT",
          headers: { ...auth, "content-type": "application/json", ...(remote ? { "if-match": `"v${remote.version}"` } : { "if-none-match": "*" }) },
          body: JSON.stringify(merged),
        });
        if (put.status === 412) continue; // another device saved first: read again and merge again
        if (put.status === 401) return { state: "signed-out" };
        if (!put.ok) return { state: "error", message: put.status === 413 ? "Your data is too large to sync." : "Could not save to your account. Try again in a moment." };
        pushed = true;
      }
      return { state: "synced", at: (d.now ?? Date.now)(), pulled, pushed };
    }
    return { state: "error", message: "Your data kept changing while syncing. It will retry." };
  } catch {
    return { state: "offline" };
  }
}
