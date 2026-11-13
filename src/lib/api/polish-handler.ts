import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";
import { bulletRequestSchema, coverRequestSchema, polishBullet, writeCover, type BulletResult, type CoverResult } from "@/lib/ai/polish";
import { ProviderError, SchemaError, type LLMProvider } from "@/lib/ai/provider";
import { ApiError, errorResponse } from "./errors";
import { assertSameOrigin, clientIp, readJson } from "./guard";
import type { RateLimiter } from "./ratelimit";

export interface PolishDeps {
  limiter: RateLimiter;
  /** Returns a provider for this request, or null when AI is not configured. */
  getProvider: (byokKey: string | null) => LLMProvider | null;
  timeoutMs?: number;
}

const envInt = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** The same plain-language failures as tailoring, so every AI feature fails the same way. */
function aiError(e: unknown): never {
  if (e instanceof SchemaError) throw new ApiError(502, "ai_bad_output", "The AI returned an unusable answer. Please retry.");
  if (e instanceof ProviderError && e.status === 429)
    throw new ApiError(503, "ai_quota_exhausted", "Today's free AI quota is used up. Try again tomorrow, or add your own free Gemini key to keep going.");
  if (e instanceof ProviderError) throw new ApiError(e.retryable ? 503 : 502, "ai_failed", "The AI service failed. Please retry.", e.retryable ? { "Retry-After": "5" } : {});
  throw e;
}

async function handle<I, O>(
  req: Request,
  deps: PolishDeps,
  cfg: { name: string; perMin: number; perDay: number; maxBody: number; schema: ZodType<I>; timeoutMs: number; run: (provider: LLMProvider, input: I, signal: AbortSignal) => Promise<O> },
): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  try {
    assertSameOrigin(req);
    const who = `ip:${clientIp(req)}`;
    await deps.limiter.check(`${cfg.name}:min:${who}`, cfg.perMin, 60_000);
    await deps.limiter.check(`${cfg.name}:day:${who}`, cfg.perDay, 86_400_000);

    const parsed = cfg.schema.safeParse(await readJson(req, cfg.maxBody));
    if (!parsed.success) {
      // Field paths only: never echo user-supplied values back.
      const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(root)"))].slice(0, 10);
      throw new ApiError(400, "validation_failed", `Invalid fields: ${fields.join(", ")}`);
    }
    const provider = deps.getProvider(req.headers.get("x-gemini-key"));
    if (!provider) throw new ApiError(503, "ai_unavailable", "AI is not configured. Add your own Gemini key or try later.");

    let result: O;
    try {
      result = await cfg.run(provider, parsed.data, AbortSignal.timeout(deps.timeoutMs ?? cfg.timeoutMs));
    } catch (e) {
      aiError(e);
    }
    return Response.json(result, { headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestId } });
  } catch (e) {
    return errorResponse(e, requestId);
  }
}

export const handleBullet = (req: Request, deps: PolishDeps): Promise<Response> =>
  handle<ReturnType<typeof bulletRequestSchema.parse>, BulletResult>(req, deps, {
    name: "bullet",
    perMin: envInt("BULLET_RATE_PER_MIN", 20),
    perDay: envInt("BULLET_RATE_PER_DAY", 200),
    maxBody: 8 * 1024,
    schema: bulletRequestSchema,
    timeoutMs: 20_000,
    run: (provider, request, signal) => polishBullet({ provider, request, signal }),
  });

export const handleCover = (req: Request, deps: PolishDeps): Promise<Response> =>
  handle<ReturnType<typeof coverRequestSchema.parse>, CoverResult>(req, deps, {
    name: "cover",
    perMin: envInt("COVER_RATE_PER_MIN", 4),
    perDay: envInt("COVER_RATE_PER_DAY", 30),
    maxBody: 64 * 1024,
    schema: coverRequestSchema,
    timeoutMs: 40_000,
    run: (provider, request, signal) => writeCover({ provider, request, signal }),
  });
