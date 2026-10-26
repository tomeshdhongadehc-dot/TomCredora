import { ApiError } from "./errors";
import type { IdempotencyStore, StoredResponse } from "./idempotency";
import type { RateLimiter } from "./ratelimit";

/** The few Redis commands we need. Upstash's client satisfies this; tests use a fake. */
export interface RedisLike {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { nx?: boolean; px?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/** Fixed-window limiter shared across all serverless instances. */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private redis: RedisLike,
    private now: () => number = Date.now,
  ) {}

  async check(key: string, limit: number, windowMs: number) {
    const bucket = Math.floor(this.now() / windowMs);
    const k = `rl:${key}:${bucket}`;
    const n = await this.redis.incr(k);
    if (n === 1) await this.redis.pexpire(k, windowMs);
    if (n > limit) {
      const retry = Math.max(1, Math.ceil(((bucket + 1) * windowMs - this.now()) / 1000));
      throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.", { "Retry-After": String(retry) });
    }
  }
}

interface Entry {
  hash: string;
  state: "pending" | "done";
  response?: StoredResponse;
}

/** Idempotency records in Redis: SET NX claims atomically, so concurrent duplicates cannot both run. */
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private redis: RedisLike) {}
  private k = (key: string) => `idem:${key}`;
  private ttl = new Map<string, number>();

  async get(key: string) {
    const raw = await this.redis.get<Entry | string>(this.k(key));
    if (!raw) return undefined;
    const e = (typeof raw === "string" ? JSON.parse(raw) : raw) as Entry;
    return { ...e, expires: 0 };
  }
  async claim(key: string, hash: string, ttlMs: number) {
    this.ttl.set(key, ttlMs);
    const ok = await this.redis.set(this.k(key), JSON.stringify({ hash, state: "pending" } satisfies Entry), { nx: true, px: ttlMs });
    return ok !== null && ok !== undefined;
  }
  async complete(key: string, response: StoredResponse) {
    const cur = await this.get(key);
    if (!cur) return;
    await this.redis.set(this.k(key), JSON.stringify({ hash: cur.hash, state: "done", response } satisfies Entry), { px: this.ttl.get(key) ?? 86_400_000 });
  }
  async release(key: string) {
    await this.redis.del(this.k(key));
  }
}
