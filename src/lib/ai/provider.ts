import type { ZodType } from "zod";

export interface GenerateRequest<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateResult<T> {
  data: T;
  usage: Usage;
  model: string;
}

/** Thrown for provider failures; `retryable` is true for 429/5xx/timeouts. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Thrown when the model output is not valid JSON for the schema. */
export class SchemaError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = "SchemaError";
  }
}

/** Every LLM adapter (Gemini now; Claude/OpenAI later) implements this. */
export interface LLMProvider {
  readonly name: string;
  generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>>;
}

/** Parse + validate raw model text. Shared by all adapters. */
export function parseModelJson<T>(raw: string, schema: ZodType<T>): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new SchemaError("Model returned invalid JSON", raw);
  }
  const res = schema.safeParse(json);
  if (!res.success) throw new SchemaError(res.error.message, raw);
  return res.data;
}
