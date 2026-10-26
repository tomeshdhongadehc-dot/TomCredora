import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/** What each fake model does: answer, hang until aborted, or fail with a status. */
type Behaviour = "ok" | "hang" | 404 | 429 | 500;
const behaviour: Record<string, Behaviour> = {};
const calls: string[] = [];

vi.mock("@google/genai", () => ({
  ThinkingLevel: { MINIMAL: "MINIMAL" },
  GoogleGenAI: class {
    models = {
      generateContent: async ({ model, config }: { model: string; config: { abortSignal?: AbortSignal } }) => {
        calls.push(model);
        const b = behaviour[model] ?? "ok";
        if (b === "ok") return { text: JSON.stringify({ v: model }), usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
        if (b === "hang")
          return new Promise((_, reject) => config.abortSignal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
        throw Object.assign(new Error(`status ${b}`), { status: b });
      },
    };
  },
}));

const schema = z.object({ v: z.string() });
const req = (signal?: AbortSignal) => ({ system: "s", user: "u", schema, maxTokens: 10, signal });

async function load() {
  vi.resetModules();
  process.env.GEMINI_MODEL_TIMEOUT_MS = "60";
  delete process.env.GEMINI_MODEL;
  return import("@/lib/ai/gemini");
}

beforeEach(() => {
  for (const k of Object.keys(behaviour)) delete behaviour[k];
  calls.length = 0;
});

describe("Gemini model chain", () => {
  it("tries the measured-fastest models first and keeps a moving alias last", async () => {
    const { DEFAULT_GEMINI_MODELS } = await load();
    expect(DEFAULT_GEMINI_MODELS.slice(0, 2)).toEqual(["gemini-3.5-flash", "gemini-3.1-flash-lite"]);
    expect(DEFAULT_GEMINI_MODELS.at(-1)).toBe("gemini-flash-latest");
  });

  it("uses the first model when it answers", async () => {
    const { GeminiProvider } = await load();
    const r = await new GeminiProvider("k").generate(req());
    expect(r.model).toBe("gemini-3.5-flash");
    expect(calls).toEqual(["gemini-3.5-flash"]);
  });

  it("moves on when a model hangs past its own deadline, instead of spending the whole budget on it", async () => {
    const { GeminiProvider } = await load();
    behaviour["gemini-3.5-flash"] = "hang";
    const t0 = Date.now();
    const r = await new GeminiProvider("k").generate(req(AbortSignal.timeout(5_000)));
    expect(r.model).toBe("gemini-3.1-flash-lite");
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it("falls through retired (404), rate-limited (429) and failing (500) models", async () => {
    const { GeminiProvider } = await load();
    behaviour["gemini-3.5-flash"] = 404;
    behaviour["gemini-3.1-flash-lite"] = 429;
    behaviour["gemini-3.8-flash"] = 500;
    const r = await new GeminiProvider("k").generate(req());
    expect(r.model).toBe("gemini-flash-latest");
    expect(calls).toEqual(["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"]);
  });

  it("when every model fails, reports the last status as a retryable provider error", async () => {
    const { GeminiProvider } = await load();
    for (const m of ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"]) behaviour[m] = 429;
    await expect(new GeminiProvider("k").generate(req())).rejects.toMatchObject({ status: 429, retryable: true });
  });

  it("the overall deadline still stops everything and says it timed out", async () => {
    const { GeminiProvider } = await load();
    for (const m of ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"]) behaviour[m] = "hang";
    await expect(new GeminiProvider("k").generate(req(AbortSignal.timeout(100)))).rejects.toMatchObject({ message: "Request timed out", retryable: true });
  });
});
