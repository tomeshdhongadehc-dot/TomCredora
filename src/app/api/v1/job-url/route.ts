import { getInfra } from "@/lib/api/runtime";
import { handleJobUrl } from "@/lib/api/job-url-handler";

export const runtime = "nodejs";
export const maxDuration = 30;

export function POST(req: Request) {
  return handleJobUrl(req, { limiter: getInfra().limiter });
}
