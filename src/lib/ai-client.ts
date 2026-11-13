"use client";

export type AiResult<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * One place that calls our own AI routes (reword a point, cover letter). Same plain-language failures as tailoring,
 * and the optional "bring your own Gemini key" goes along as a header, exactly as it does there.
 */
export async function callAi<T>(path: string, body: unknown, apiKey: string): Promise<AiResult<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(apiKey.trim() ? { "x-gemini-key": apiKey.trim() } : {}) },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      const retry = res.headers.get("retry-after");
      return { ok: false, message: j?.error?.message ?? "Something went wrong." + (retry ? ` Try again in ${retry}s.` : "") };
    }
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, message: "Network problem. Check your connection and try again." };
  }
}
