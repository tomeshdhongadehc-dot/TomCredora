import { authenticate } from "@/lib/api/auth";
import { handleItem } from "@/lib/api/resumes-handler";
import { getInfra } from "@/lib/api/runtime";

export const runtime = "nodejs";

const handle = async (req: Request, ctx: RouteContext<"/api/v1/resumes/[id]">) =>
  handleItem(req, (await ctx.params).id, { auth: authenticate, ...getInfra() });
export { handle as GET, handle as PUT, handle as DELETE };
