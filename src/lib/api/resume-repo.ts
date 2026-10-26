import { randomUUID } from "node:crypto";
import type { Resume } from "@/lib/schema";
import type { TemplateConfig } from "@/lib/templates";

export interface StoredResume {
  id: string;
  title: string;
  data: Resume;
  template: TemplateConfig;
  jdHash: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type NewResume = Pick<StoredResume, "title" | "data" | "template"> & { jdHash?: string | null };
export type ResumePatch = Partial<NewResume>;

export type UpdateResult = { ok: true; value: StoredResume } | { ok: false; reason: "not_found" | "version_conflict" };

/**
 * Persistence port. Every method takes userId and MUST scope by it: a row that belongs
 * to someone else is indistinguishable from a missing row (no existence leak).
 */
export interface ResumeRepo {
  list(userId: string, opts: { limit: number; before?: string }): Promise<StoredResume[]>;
  get(userId: string, id: string): Promise<StoredResume | null>;
  create(userId: string, r: NewResume): Promise<StoredResume>;
  update(userId: string, id: string, expectedVersion: number, patch: ResumePatch): Promise<UpdateResult>;
  remove(userId: string, id: string): Promise<boolean>;
}

/** In-memory implementation for tests and local dev. */
export class MemoryResumeRepo implements ResumeRepo {
  private rows = new Map<string, StoredResume & { userId: string; deleted?: boolean }>();
  constructor(private now: () => Date = () => new Date()) {}

  async list(userId: string, { limit, before }: { limit: number; before?: string }) {
    return [...this.rows.values()]
      .filter((r) => r.userId === userId && !r.deleted && (!before || r.updatedAt < before))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, limit)
      .map(strip);
  }
  async get(userId: string, id: string) {
    const r = this.rows.get(id);
    return r && r.userId === userId && !r.deleted ? strip(r) : null;
  }
  async create(userId: string, r: NewResume) {
    const ts = this.now().toISOString();
    const row = { id: randomUUID(), userId, jdHash: null, ...r, version: 1, createdAt: ts, updatedAt: ts };
    this.rows.set(row.id, row as never);
    return strip(row as never);
  }
  async update(userId: string, id: string, expectedVersion: number, patch: ResumePatch): Promise<UpdateResult> {
    const r = this.rows.get(id);
    if (!r || r.userId !== userId || r.deleted) return { ok: false, reason: "not_found" };
    if (r.version !== expectedVersion) return { ok: false, reason: "version_conflict" };
    Object.assign(r, patch, { version: r.version + 1, updatedAt: this.now().toISOString() });
    return { ok: true, value: strip(r) };
  }
  async remove(userId: string, id: string) {
    const r = this.rows.get(id);
    if (!r || r.userId !== userId || r.deleted) return false;
    r.deleted = true;
    return true;
  }
}

function strip(r: StoredResume & { userId?: string; deleted?: boolean }): StoredResume {
  const { userId: _u, deleted: _d, ...rest } = r;
  void _u;
  void _d;
  return structuredClone(rest);
}
