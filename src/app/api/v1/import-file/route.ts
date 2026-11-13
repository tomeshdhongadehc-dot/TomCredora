import { getInfra } from "@/lib/api/runtime";
import { handleImportFile } from "@/lib/api/import-handler";

export const runtime = "nodejs";
export const maxDuration = 30;

export function POST(req: Request) {
  return handleImportFile(req, { limiter: getInfra().limiter });
}
