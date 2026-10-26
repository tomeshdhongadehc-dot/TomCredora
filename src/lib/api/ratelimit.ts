import { ApiError } from "./errors";

export interface RateLimiter {
  /** Throws ApiError(429) when the key exceeds `limit` hits in `windowMs`. */
  check(key: string, limit: number, windowMs: number): Promise<void>;
}

/** Sliding-window limiter. In-memory: fine for dev/tests; swap for Upstash on Vercel (same interface). */
export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private now: () => number = Date.now) {}

  async check(key: string, limit: number, windowMs: number) {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) {
      const retry = Math.max(1, Math.ceil((windowMs - (t - recent[0])) / 1000));
      throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.", { "Retry-After": String(retry) });
    }
    recent.push(t);
    this.hits.set(key, recent);
  }
}
