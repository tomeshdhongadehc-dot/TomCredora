import { Redis } from "@upstash/redis";
import { MemoryIdempotencyStore, type IdempotencyStore } from "./idempotency";
import { MemoryRateLimiter, type RateLimiter } from "./ratelimit";
import { RedisIdempotencyStore, RedisRateLimiter, type RedisLike } from "./redis-stores";

interface Infra {
  store: IdempotencyStore;
  limiter: RateLimiter;
  /** "redis" in production (shared across instances), "memory" for local dev. */
  kind: "redis" | "memory";
}

let cached: Infra | undefined;

/** Picks shared Redis when configured, otherwise per-instance memory (dev only). */
export function getInfra(): Infra {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const redis = new Redis({ url, token }) as unknown as RedisLike;
    cached = { store: new RedisIdempotencyStore(redis), limiter: new RedisRateLimiter(redis), kind: "redis" };
  } else {
    if (process.env.NODE_ENV === "production") console.warn("UPSTASH_REDIS_REST_URL not set: rate limits and idempotency are per-instance.");
    cached = { store: new MemoryIdempotencyStore(), limiter: new MemoryRateLimiter(), kind: "memory" };
  }
  return cached;
}
