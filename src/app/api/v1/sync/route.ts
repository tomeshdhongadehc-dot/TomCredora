import { authenticate } from "@/lib/api/auth";
import { getInfra } from "@/lib/api/runtime";
import { handleSync } from "@/lib/api/sync-handler";

export const runtime = "nodejs";

const handle = (req: Request) => handleSync(req, { auth: authenticate, limiter: getInfra().limiter });
export { handle as GET, handle as PUT, handle as DELETE };
