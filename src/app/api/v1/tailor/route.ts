import { GeminiProvider } from "@/lib/ai/gemini";
import { getInfra } from "@/lib/api/runtime";
import { handleTailor } from "@/lib/api/tailor-handler";

export const runtime = "nodejs";
// Must stay above the handler's own 40s limit (tailor-handler.ts), so a slow AI answer ends with our clear message, not the platform's.
export const maxDuration = 60;

export function POST(req: Request) {
  const { store, limiter } = getInfra();
  return handleTailor(req, {
    store,
    limiter,
    getProvider: (byok) => {
      const key = byok?.trim() || process.env.GEMINI_API_KEY;
      return key ? new GeminiProvider(key) : null;
    },
  });
}
