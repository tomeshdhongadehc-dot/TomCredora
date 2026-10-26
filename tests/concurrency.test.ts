import { describe, expect, it } from "vitest";
import { MemoryIdempotencyStore, type IdempotencyStore } from "@/lib/api/idempotency";
import { MemoryRateLimiter } from "@/lib/api/ratelimit";
import { RedisIdempotencyStore, RedisRateLimiter, type RedisLike } from "@/lib/api/redis-stores";
import { handleTailor } from "@/lib/api/tailor-handler";
import type { TailorOutput } from "@/lib/ai/prompts/v2/tailor";
import type { LLMProvider } from "@/lib/ai/provider";
import { SAMPLE_JD, SAMPLE_RESUME } from "./fixtures";

/** Behaves like Redis: NX/PX semantics, INCR, TTL with a controllable clock, and async hops. */
function fakeRedis(now: () => number): RedisLike {
  const m = new Map<string, { v: unknown; exp: number }>();
  const live = (k: string) => {
    const e = m.get(k);
    if (e && e.exp <= now()) m.delete(k);
    return m.get(k);
  };
  const hop = () => new Promise((r) => setTimeout(r, 0));
  return {
    async incr(k) {
      await hop();
      const e = live(k);
      const n = ((e?.v as number) ?? 0) + 1;
      m.set(k, { v: n, exp: e?.exp ?? Infinity });
      return n;
    },
    async pexpire(k, ms) {
      const e = live(k);
      if (e) e.exp = now() + ms;
    },
    async get(k) {
      await hop();
      return (live(k)?.v as never) ?? null;
    },
    async set(k, v, o) {
      await hop();
      if (o?.nx && live(k)) return null;
      m.set(k, { v, exp: o?.px ? now() + o.px : Infinity });
      return "OK";
    },
    async del(k) {
      m.delete(k);
    },
  };
}

const output: TailorOutput = {
  summary: "Frontend engineer with 5 years building React and TypeScript products.",
  skills: [{ label: "Frameworks", items: ["React"] }],
  experience: [{ id: "e1", bullets: [{ text: "Built React dashboard used by 12,000 customers, cutting load time by 38%", from: 0, needs_metric: false, keywords_used: ["React"] }] }],
  questions: [],
};

function slowProvider() {
  const s = { calls: 0 };
  const p: LLMProvider = {
    name: "slow",
    async generate<T>() {
      s.calls++;
      await new Promise((r) => setTimeout(r, 40));
      return { data: output as unknown as T, usage: { inputTokens: 1, outputTokens: 1 }, model: "m" };
    },
  };
  return { p, s };
}

const req = (key: string, h: Record<string, string> = {}) =>
  new Request("http://localhost/api/v1/tailor", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost", "idempotency-key": key, ...h },
    body: JSON.stringify({ profile: SAMPLE_RESUME, jd: SAMPLE_JD }),
  });

const stores: [string, () => { store: IdempotencyStore; limiter: ReturnType<typeof limiterFor> }][] = [
  ["memory", () => ({ store: new MemoryIdempotencyStore(), limiter: limiterFor("mem") })],
  ["redis", () => ({ store: new RedisIdempotencyStore(fakeRedis(Date.now)), limiter: limiterFor("redis") })],
];
function limiterFor(kind: string) {
  return kind === "mem" ? new MemoryRateLimiter() : new RedisRateLimiter(fakeRedis(Date.now));
}

describe.each(stores)("idempotency under concurrency (%s store)", (_n, make) => {
  it("5 simultaneous identical requests cause exactly ONE AI call", async () => {
    const { store, limiter } = make();
    const { p, s } = slowProvider();
    const deps = { store, limiter: { check: async () => {} }, getProvider: () => p };
    void limiter;
    const key = "concurrent-key-0123456789";
    const res = await Promise.all(Array.from({ length: 5 }, () => handleTailor(req(key), deps)));
    expect(s.calls).toBe(1);
    const statuses = res.map((r) => r.status).sort();
    expect(statuses.filter((x) => x === 200).length).toBeGreaterThanOrEqual(1);
    expect(statuses.every((x) => x === 200 || x === 409)).toBe(true);
    // after it finishes, a retry replays the stored answer without calling the AI again
    const again = await handleTailor(req(key), deps);
    expect(again.status).toBe(200);
    expect(again.headers.get("idempotent-replay")).toBe("true");
    expect(s.calls).toBe(1);
  });

  it("different keys are independent", async () => {
    const { store } = make();
    const { p, s } = slowProvider();
    const deps = { store, limiter: { check: async () => {} }, getProvider: () => p };
    await Promise.all(["key-aaaaaaaaaaaaaaaa", "key-bbbbbbbbbbbbbbbb"].map((k) => handleTailor(req(k), deps)));
    expect(s.calls).toBe(2);
  });
});

describe("RedisRateLimiter", () => {
  it("enforces the limit per window and resets in the next one", async () => {
    let t = 1_000_000;
    const rl = new RedisRateLimiter(fakeRedis(() => t), () => t);
    for (let i = 0; i < 3; i++) await rl.check("u", 3, 60_000);
    await expect(rl.check("u", 3, 60_000)).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    await expect(rl.check("other", 3, 60_000)).resolves.toBeUndefined();
    t += 60_000;
    await expect(rl.check("u", 3, 60_000)).resolves.toBeUndefined();
  });
  it("sets a sensible Retry-After", async () => {
    const t = 1_000_000;
    const rl = new RedisRateLimiter(fakeRedis(() => t), () => t);
    await rl.check("u", 1, 60_000);
    const err = await rl.check("u", 1, 60_000).catch((e) => e);
    expect(Number(err.headers["Retry-After"])).toBeGreaterThanOrEqual(1);
    expect(Number(err.headers["Retry-After"])).toBeLessThanOrEqual(60);
  });
  it("is safe under a burst of parallel checks (never exceeds the limit)", async () => {
    const rl = new RedisRateLimiter(fakeRedis(Date.now));
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => rl.check("burst", 5, 60_000)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
  });
});

describe("RedisIdempotencyStore expiry", () => {
  it("a claim expires after its TTL so the key can be reused", async () => {
    let t = 0;
    const s = new RedisIdempotencyStore(fakeRedis(() => t));
    expect(await s.claim("k", "h1", 1000)).toBe(true);
    expect(await s.claim("k", "h1", 1000)).toBe(false);
    t = 1001;
    expect(await s.claim("k", "h2", 1000)).toBe(true);
  });
});
