import { GeminiProvider } from "@/lib/ai/gemini";
import { getInfra } from "@/lib/api/runtime";
import { handleCover } from "@/lib/api/polish-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export function POST(req: Request) {
  return handleCover(req, {
    limiter: getInfra().limiter,
    getProvider: (byok) => {
      const key = byok?.trim() || process.env.GEMINI_API_KEY;
      return key ? new GeminiProvider(key) : null;
    },
  });
}
