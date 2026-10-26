import { authenticate } from "@/lib/api/auth";
import { handleCollection } from "@/lib/api/resumes-handler";
import { getInfra } from "@/lib/api/runtime";

export const runtime = "nodejs";

const handle = (req: Request) => handleCollection(req, { auth: authenticate, ...getInfra() });
export { handle as GET, handle as POST };
