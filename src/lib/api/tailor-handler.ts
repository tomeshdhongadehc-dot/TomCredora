import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SchemaError, ProviderError, type LLMProvider } from "@/lib/ai/provider";
import { tailorResume } from "@/lib/ai/tailor";
import { scoreResume } from "@/lib/ats-score";
import { jdInputSchema, resumeSchema } from "@/lib/schema";
import { ApiError, errorResponse } from "./errors";
import { assertSameOrigin, clientIp, readJson } from "./guard";
import { withIdempotency, type IdempotencyStore } from "./idempotency";
import type { RateLimiter } from "./ratelimit";

export const tailorRequestSchema = z.strictObject({
  profile: resumeSchema,
  jd: jdInputSchema.shape.jd,
});

export interface TailorDeps {
  store: IdempotencyStore;
  limiter: RateLimiter;
  /** Returns a provider for this request, or null when AI is not configured. */
  getProvider: (byokKey: string | null) => LLMProvider | null;
  timeoutMs?: number;
}

const envInt = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
/** Per-client AI call limits. Override with TAILOR_RATE_PER_MIN / TAILOR_RATE_PER_DAY. */
const rate = () => ({ perMinute: envInt("TAILOR_RATE_PER_MIN", 6), perDay: envInt("TAILOR_RATE_PER_DAY", 40) });

export async function handleTailor(req: Request, deps: TailorDeps): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  try {
    assertSameOrigin(req);
    // TODO(auth): replace the IP with the authenticated user id once Supabase auth lands.
    const who = `ip:${clientIp(req)}`;
    const { perMinute, perDay } = rate();
    await deps.limiter.check(`tailor:min:${who}`, perMinute, 60_000);
    await deps.limiter.check(`tailor:day:${who}`, perDay, 86_400_000);

    const raw = await readJson(req);
    const parsed = tailorRequestSchema.safeParse(raw);
    if (!parsed.success) {
      // Field paths only: never echo user-supplied values back.
      const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(root)"))].slice(0, 10);
      throw new ApiError(400, "validation_failed", `Invalid fields: ${fields.join(", ")}`);
    }

    const provider = deps.getProvider(req.headers.get("x-gemini-key"));
    if (!provider) throw new ApiError(503, "ai_unavailable", "AI is not configured. Add your own Gemini key or try later.");

    const out = await withIdempotency(deps.store, who, req.headers.get("idempotency-key"), parsed.data, async () => {
      try {
        const signal = AbortSignal.timeout(deps.timeoutMs ?? 40_000);
        const r = await tailorResume({ provider, profile: parsed.data.profile, jd: parsed.data.jd, signal });
        const ats = scoreResume(r.resume, r.keywords);
        return { status: 200, body: { ...r, ats } };
      } catch (e) {
        if (e instanceof SchemaError) throw new ApiError(502, "ai_bad_output", "The AI returned an unusable answer. Please retry.");
        // Free-tier keys allow only a small number of requests per day per model; say so plainly instead of "failed".
        if (e instanceof ProviderError && e.status === 429)
          throw new ApiError(503, "ai_quota_exhausted", "Today's free AI quota is used up. Try again tomorrow, or add your own free Gemini key to keep going.");
        if (e instanceof ProviderError)
          throw new ApiError(e.retryable ? 503 : 502, "ai_failed", "The AI service failed. Please retry.", e.retryable ? { "Retry-After": "5" } : {});
        if (e instanceof Error && e.message.includes("safety checks"))
          throw new ApiError(502, "ai_rejected", "The AI output failed safety checks. Please retry.");
        throw e;
      }
    });

    return Response.json(out.body, {
      status: out.status,
      headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestId, "Idempotent-Replay": String(out.replayed) },
    });
  } catch (e) {
    return errorResponse(e, requestId);
  }
}
