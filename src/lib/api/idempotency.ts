import { createHash } from "node:crypto";
import { ApiError } from "./errors";

export interface StoredResponse {
  status: number;
  body: unknown;
}
interface Entry {
  hash: string;
  state: "pending" | "done";
  response?: StoredResponse;
  expires: number;
}

export interface IdempotencyStore {
  get(key: string): Promise<Entry | undefined>;
  /** Atomically claim a key; returns false if it already exists. */
  claim(key: string, hash: string, ttlMs: number): Promise<boolean>;
  complete(key: string, response: StoredResponse): Promise<void>;
  release(key: string): Promise<void>;
}

/** In-memory store (dev/tests). Production: same interface over Upstash/Postgres. */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private m = new Map<string, Entry>();
  constructor(private now: () => number = Date.now) {}
  async get(key: string) {
    const e = this.m.get(key);
    if (e && e.expires < this.now()) {
      this.m.delete(key);
      return undefined;
    }
    return e;
  }
  async claim(key: string, hash: string, ttlMs: number) {
    // Check-and-set must be synchronous: any `await` between them lets a concurrent claim slip through.
    const cur = this.m.get(key);
    if (cur && cur.expires >= this.now()) return false;
    this.m.set(key, { hash, state: "pending", expires: this.now() + ttlMs });
    return true;
  }
  async complete(key: string, response: StoredResponse) {
    const e = this.m.get(key);
    if (e) this.m.set(key, { ...e, state: "done", response });
  }
  async release(key: string) {
    this.m.delete(key);
  }
}

export const hashBody = (body: unknown) => createHash("sha256").update(JSON.stringify(body)).digest("hex");

const KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;
const TTL = 24 * 60 * 60 * 1000;

/**
 * Same key + same body  -> replay the stored response (no second AI call).
 * Same key + other body -> 422. Same key still running -> 409.
 * Failures are not stored, so the client can safely retry with the same key.
 */
export async function withIdempotency(
  store: IdempotencyStore,
  scope: string,
  key: string | null,
  body: unknown,
  run: () => Promise<StoredResponse>,
): Promise<StoredResponse & { replayed: boolean }> {
  if (!key || !KEY_RE.test(key))
    throw new ApiError(400, "idempotency_key_required", "Send a valid Idempotency-Key header (16-64 chars: letters, digits, - _).");
  const k = `${scope}:${key}`;
  const hash = hashBody(body);

  if (!(await store.claim(k, hash, TTL))) {
    const e = await store.get(k);
    if (!e) return withIdempotency(store, scope, key, body, run); // expired between calls
    if (e.hash !== hash) throw new ApiError(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request.");
    if (e.state === "pending") throw new ApiError(409, "request_in_progress", "An identical request is still running.", { "Retry-After": "2" });
    return { ...e.response!, replayed: true };
  }
  try {
    const res = await run();
    await store.complete(k, res);
    return { ...res, replayed: false };
  } catch (err) {
    await store.release(k);
    throw err;
  }
}
