import { describe, expect, it } from "vitest";
import { MemoryIdempotencyStore } from "@/lib/api/idempotency";
import { MemoryRateLimiter } from "@/lib/api/ratelimit";
import { handleTailor, type TailorDeps } from "@/lib/api/tailor-handler";
import { SchemaError, ProviderError, type LLMProvider } from "@/lib/ai/provider";
import type { TailorOutput } from "@/lib/ai/prompts/v2/tailor";
import { SAMPLE_JD, SAMPLE_RESUME } from "./fixtures";

const output: TailorOutput = {
  summary: "Frontend engineer with 5 years building React and TypeScript products.",
  skills: [{ label: "Frameworks", items: ["React", "Next.js"] }],
  experience: [
    {
      id: "e1",
      bullets: [
        { text: "Built React dashboard used by 12,000 customers, cutting load time by 38%", from: 0, needs_metric: false, keywords_used: ["React"] },
        { text: "Migrated 40 components to TypeScript, reducing production bugs by 25%", from: 1, needs_metric: false, keywords_used: ["TypeScript"] },
        { text: "Led CI/CD pipeline setup on AWS, shortening release cycle from 5 days to 1", from: 2, needs_metric: false, keywords_used: ["AWS"] },
      ],
    },
  ],
  questions: [],
};

function setup(over: Partial<{ fail: Error; limiter: MemoryRateLimiter }> = {}) {
  const state = { calls: 0 };
  const provider: LLMProvider = {
    name: "mock",
    async generate<T>() {
      state.calls++;
      if (over.fail) throw over.fail;
      return { data: output as unknown as T, usage: { inputTokens: 10, outputTokens: 5 }, model: "mock" };
    },
  };
  const deps: TailorDeps = {
    store: new MemoryIdempotencyStore(),
    limiter: over.limiter ?? new MemoryRateLimiter(),
    getProvider: () => provider,
  };
  return { deps, state };
}

const KEY = "0123456789abcdef0123";
const body = { profile: SAMPLE_RESUME, jd: SAMPLE_JD };
const req = (b: unknown, h: Record<string, string> = {}, raw?: string) =>
  new Request("http://localhost/api/v1/tailor", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost", "idempotency-key": KEY, ...h },
    body: raw ?? JSON.stringify(b),
  });
const errCode = async (r: Response) => (await r.json()).error.code;

describe("POST /api/v1/tailor", () => {
  it("returns tailored resume, ATS report and request id", async () => {
    const { deps } = setup();
    const r = await handleTailor(req(body), deps);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-request-id")).toBeTruthy();
    expect(r.headers.get("cache-control")).toContain("no-store");
    const j = await r.json();
    expect(j.ats.score).toBeGreaterThan(0);
    expect(j.ledger.length).toBe(3);
  });

  it("is idempotent: same key + body replays without a second AI call", async () => {
    const { deps, state } = setup();
    const a = await handleTailor(req(body), deps);
    const b = await handleTailor(req(body), deps);
    expect(state.calls).toBe(1);
    expect(b.headers.get("idempotent-replay")).toBe("true");
    expect(await b.json()).toEqual(await a.json());
  });

  it("rejects same key with a different body (422)", async () => {
    const { deps } = setup();
    await handleTailor(req(body), deps);
    const r = await handleTailor(req({ ...body, jd: SAMPLE_JD + " extra" }), deps);
    expect(r.status).toBe(422);
    expect(await errCode(r)).toBe("idempotency_key_reused");
  });

  it("requires a valid Idempotency-Key", async () => {
    const { deps } = setup();
    const r = await handleTailor(req(body, { "idempotency-key": "short" }), deps);
    expect(r.status).toBe(400);
    expect(await errCode(r)).toBe("idempotency_key_required");
  });

  it("allows retry with the same key after an AI failure (not cached)", async () => {
    const { deps } = setup({ fail: new ProviderError("boom", true, 503) });
    const first = await handleTailor(req(body), deps);
    expect(first.status).toBe(503);
    expect(first.headers.get("retry-after")).toBe("5");
    const second = await handleTailor(req(body), deps);
    expect(second.status).toBe(503); // ran again, not 409/replay
  });

  it("maps bad model output to 502 without leaking details", async () => {
    const { deps } = setup({ fail: new SchemaError("secret internal zod text", "raw") });
    const r = await handleTailor(req(body), deps);
    expect(r.status).toBe(502);
    expect(JSON.stringify(await r.json())).not.toContain("secret internal");
  });

  it("validates input strictly and never echoes values", async () => {
    const { deps } = setup();
    const r = await handleTailor(req({ ...body, jd: "x", admin: "SECRET-VALUE" }), deps);
    expect(r.status).toBe(400);
    const text = JSON.stringify(await r.json());
    expect(text).toContain("validation_failed");
    expect(text).not.toContain("SECRET-VALUE");
  });

  it("rejects wrong content-type, bad JSON and oversize bodies", async () => {
    const { deps } = setup();
    expect((await handleTailor(req(body, { "content-type": "text/plain" }), deps)).status).toBe(415);
    expect((await handleTailor(req(null, {}, "{nope"), deps)).status).toBe(400);
    expect((await handleTailor(req(null, {}, JSON.stringify({ jd: "x".repeat(70_000) })), deps)).status).toBe(413);
  });

  it("blocks cross-origin browser requests (CSRF)", async () => {
    const { deps } = setup();
    const r = await handleTailor(req(body, { origin: "https://evil.example" }), deps);
    expect(r.status).toBe(403);
    expect((await handleTailor(req(body, { origin: "http://localhost" }), deps)).status).toBe(200);
  });

  it("rate limits per client", async () => {
    const { deps } = setup();
    let last = 200;
    for (let i = 0; i < 7; i++) {
      const r = await handleTailor(req(body, { "idempotency-key": `key-${String(i).padStart(16, "0")}` }), deps);
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it("returns 503 when AI is not configured", async () => {
    const { deps } = setup();
    const r = await handleTailor(req(body), { ...deps, getProvider: () => null });
    expect(r.status).toBe(503);
    expect(await errCode(r)).toBe("ai_unavailable");
  });
});
