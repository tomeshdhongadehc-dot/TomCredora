import type { Snapshot } from "@/lib/sync/model";

export interface StoredSnapshot {
  snapshot: Snapshot;
  version: number;
  updatedAt: string;
}

export type PutResult = { ok: true; value: StoredSnapshot } | { ok: false; reason: "version_conflict" };

/**
 * Persistence port for a person's synced data. Every method takes userId and MUST scope by it.
 * `expectedVersion` null means "create": it must not exist yet. Otherwise it is a compare-and-swap on the version.
 */
export interface SnapshotRepo {
  get(userId: string): Promise<StoredSnapshot | null>;
  put(userId: string, snapshot: Snapshot, expectedVersion: number | null): Promise<PutResult>;
  remove(userId: string): Promise<boolean>;
}

/** In-memory implementation for tests and local development. */
export class MemorySnapshotRepo implements SnapshotRepo {
  private rows = new Map<string, StoredSnapshot>();
  constructor(private now: () => Date = () => new Date()) {}

  async get(userId: string) {
    const r = this.rows.get(userId);
    return r ? structuredClone(r) : null;
  }
  async put(userId: string, snapshot: Snapshot, expectedVersion: number | null): Promise<PutResult> {
    const cur = this.rows.get(userId);
    if (expectedVersion === null ? cur : !cur || cur.version !== expectedVersion) return { ok: false, reason: "version_conflict" };
    const next: StoredSnapshot = { snapshot: structuredClone(snapshot), version: (cur?.version ?? 0) + 1, updatedAt: this.now().toISOString() };
    this.rows.set(userId, next);
    return { ok: true, value: structuredClone(next) };
  }
  async remove(userId: string) {
    return this.rows.delete(userId);
  }
}
