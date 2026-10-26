import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import {
  ProviderError,
  SchemaError,
  parseModelJson,
  type GenerateRequest,
  type GenerateResult,
  type LLMProvider,
} from "./provider";

/**
 * Models are retired often (gemini-2.5-flash already stopped serving new keys), so we keep an ordered
 * fallback chain. Override with GEMINI_MODEL="primary,fallback1,fallback2".
 * `gemini-flash-latest` is a moving alias: the last-resort safety net that survives future retirements.
 * Order is by measured speed (a "reply ok" probe: 3.5-flash 1.6s, 3.1-flash-lite 1.9s, 3.8-flash 17s, flash-latest 21s),
 * because the whole tailoring request has a time budget and a slow first model used all of it.
 */
export const DEFAULT_GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"];

/** One model gets this long before we move on to the next, so a slow model cannot eat the whole request budget. */
export const MODEL_TIMEOUT_MS = Number(process.env.GEMINI_MODEL_TIMEOUT_MS) || 12_000;

export function configuredModels(): string[] {
  const env = process.env.GEMINI_MODEL?.split(",").map((m) => m.trim()).filter(Boolean);
  return env?.length ? env : DEFAULT_GEMINI_MODELS;
}

/** JSON-schema keywords the Gemini API rejects with "400 INVALID_ARGUMENT". Our zod schema still enforces them after the response. */
const UNSUPPORTED_SCHEMA_KEYS = new Set(["$schema", "maxLength", "minLength", "maxItems", "minItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "pattern", "format", "default"]);

/** zod -> the subset of JSON Schema that Gemini's structured output accepts. */
export function toGeminiSchema(schema: z.ZodType): unknown {
  const strip = (o: unknown): unknown =>
    Array.isArray(o)
      ? o.map(strip)
      : o && typeof o === "object"
        ? Object.fromEntries(Object.entries(o).filter(([k]) => !UNSUPPORTED_SCHEMA_KEYS.has(k)).map(([k, v]) => [k, strip(v)]))
        : o;
  return strip(z.toJSONSchema(schema));
}

/** Errors worth trying the next model for: retired/unknown model, rate limit, server trouble. */
const shouldFallback = (status?: number) => status === 404 || status === 429 || (status !== undefined && status >= 500) || status === undefined;

function statusOf(e: unknown): number | undefined {
  const s = (e as { status?: number }).status;
  if (typeof s === "number") return s;
  // The SDK sometimes only embeds the code in a JSON message string.
  const m = /"code":\s*(\d{3})/.exec(e instanceof Error ? e.message : "");
  return m ? Number(m[1]) : undefined;
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly models: string[] = configuredModels(),
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  private async call<T>(model: string, req: GenerateRequest<T>, thinking: boolean): Promise<GenerateResult<T>> {
    // Thinking tokens cost free-tier quota and this task does not need them.
    const thinkingConfig = !thinking ? undefined : /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: ThinkingLevel.MINIMAL };
    const res = await this.client.models.generateContent({
      model,
      contents: req.user,
      config: {
        systemInstruction: req.system,
        responseMimeType: "application/json",
        responseJsonSchema: toGeminiSchema(req.schema as z.ZodType),
        temperature: req.temperature ?? 0.3,
        maxOutputTokens: req.maxTokens,
        abortSignal: req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(MODEL_TIMEOUT_MS)]) : AbortSignal.timeout(MODEL_TIMEOUT_MS),
        ...(thinkingConfig ? { thinkingConfig } : {}),
      },
    });
    return {
      data: parseModelJson(res.text ?? "", req.schema),
      model,
      usage: { inputTokens: res.usageMetadata?.promptTokenCount ?? 0, outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0 },
    };
  }

  async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    let last: unknown;
    for (const model of this.models) {
      try {
        try {
          return await this.call(model, req, true);
        } catch (e) {
          // Some models reject a thinking config: retry the SAME model once without it.
          if (e instanceof SchemaError || statusOf(e) !== 400) throw e;
          return await this.call(model, req, false);
        }
      } catch (e) {
        if (e instanceof SchemaError) throw e; // orchestrator handles the repair retry
        if (req.signal?.aborted) throw new ProviderError("Request timed out", true);
        last = e;
        if (!shouldFallback(statusOf(e))) break; // e.g. 400/401/403: switching models will not help
      }
    }
    const status = statusOf(last);
    throw new ProviderError(
      last instanceof Error ? last.message : "Gemini request failed",
      status === undefined || status === 429 || status >= 500,
      status,
    );
  }
}
