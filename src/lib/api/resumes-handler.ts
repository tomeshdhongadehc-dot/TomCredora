import { randomUUID } from "node:crypto";
import { z } from "zod";
import { resumeSchema } from "@/lib/schema";
import { templateConfigSchema } from "@/lib/templates";
import { ApiError, errorResponse } from "./errors";
import { assertSameOrigin, readJson } from "./guard";
import { withIdempotency, type IdempotencyStore } from "./idempotency";
import type { RateLimiter } from "./ratelimit";
import type { ResumeRepo } from "./resume-repo";
import type { SnapshotRepo } from "./snapshot-repo";

export interface AuthContext {
  userId: string;
  repo: ResumeRepo;
  /** the synced profile + resumes document; absent where sync is not set up */
  snapshots?: SnapshotRepo;
}

export interface ResumesDeps {
  /** Verifies the caller and returns a repo scoped to them; null = unauthenticated. */
  auth: (req: Request) => Promise<AuthContext | null>;
  store: IdempotencyStore;
  limiter: RateLimiter;
}

const fields = {
  title: z.string().trim().min(1).max(120),
  data: resumeSchema,
  template: templateConfigSchema,
  jdHash: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
};
export const createSchema = z.strictObject(fields);
export const updateSchema = z.strictObject({ title: fields.title.optional(), data: fields.data.optional(), template: fields.template.optional(), jdHash: fields.jdHash }).refine((o) => Object.keys(o).length > 0, "Nothing to update");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const etag = (v: number) => `"v${v}"`;
const parseEtag = (h: string | null) => {
  const m = /^"?v(\d{1,9})"?$/.exec(h?.trim() ?? "");
  return m ? Number(m[1]) : null;
};

function validation(e: z.ZodError): never {
  const f = [...new Set(e.issues.map((i) => i.path.join(".") || "(root)"))].slice(0, 10);
  throw new ApiError(400, "validation_failed", `Invalid fields: ${f.join(", ")}`);
}

async function guard(req: Request, deps: ResumesDeps, write: boolean) {
  if (write) assertSameOrigin(req);
  const ctx = await deps.auth(req);
  if (!ctx) throw new ApiError(401, "unauthenticated", "Sign in to continue.", { "WWW-Authenticate": "Bearer" });
  await deps.limiter.check(`resumes:${write ? "w" : "r"}:${ctx.userId}`, write ? 60 : 240, 60_000);
  return ctx;
}

const json = (body: unknown, status: number, requestId: string, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestId, ...extra } });

/** GET /api/v1/resumes and POST /api/v1/resumes */
export async function handleCollection(req: Request, deps: ResumesDeps): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  try {
    if (req.method === "GET") {
      const { repo, userId } = await guard(req, deps, false);
      const url = new URL(req.url);
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1), 50);
      const before = url.searchParams.get("before") ?? undefined;
      if (before && Number.isNaN(Date.parse(before))) throw new ApiError(400, "validation_failed", "Invalid fields: before");
      const items = await repo.list(userId, { limit, before });
      // List omits the heavy body: titles + versions only.
      return json({ items: items.map(({ id, title, version, updatedAt }) => ({ id, title, version, updatedAt })), next: items.length === limit ? items.at(-1)!.updatedAt : null }, 200, requestId);
    }
    if (req.method === "POST") {
      const { repo, userId } = await guard(req, deps, true);
      const parsed = createSchema.safeParse(await readJson(req, 256 * 1024));
      if (!parsed.success) validation(parsed.error);
      const out = await withIdempotency(deps.store, `resumes:${userId}`, req.headers.get("idempotency-key"), parsed.data, async () => {
        const created = await repo.create(userId, parsed.data!);
        return { status: 201, body: created };
      });
      const v = (out.body as { id: string; version: number });
      return json(out.body, out.status, requestId, { ETag: etag(v.version), Location: `/api/v1/resumes/${v.id}`, "Idempotent-Replay": String(out.replayed) });
    }
    throw new ApiError(405, "method_not_allowed", "Method not allowed.", { Allow: "GET, POST" });
  } catch (e) {
    return errorResponse(e, requestId);
  }
}

/** GET / PUT / DELETE /api/v1/resumes/:id */
export async function handleItem(req: Request, id: string, deps: ResumesDeps): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  try {
    const write = req.method !== "GET";
    const { repo, userId } = await guard(req, deps, write);
    // A malformed id is indistinguishable from "not found".
    if (!UUID.test(id)) throw new ApiError(404, "not_found", "Resume not found.");

    if (req.method === "GET") {
      const r = await repo.get(userId, id);
      if (!r) throw new ApiError(404, "not_found", "Resume not found.");
      const inm = parseEtag(req.headers.get("if-none-match"));
      if (inm === r.version) return new Response(null, { status: 304, headers: { ETag: etag(r.version), "Cache-Control": "private, no-cache" } });
      return json(r, 200, requestId, { ETag: etag(r.version) });
    }
    if (req.method === "PUT") {
      const expected = parseEtag(req.headers.get("if-match"));
      if (req.headers.get("if-match") === null) throw new ApiError(428, "precondition_required", "Send If-Match with the ETag you last received.");
      if (expected === null) throw new ApiError(400, "invalid_if_match", "If-Match must be an ETag from a previous response.");
      const parsed = updateSchema.safeParse(await readJson(req, 256 * 1024));
      if (!parsed.success) validation(parsed.error);
      const res = await repo.update(userId, id, expected, parsed.data!);
      if (!res.ok) {
        if (res.reason === "not_found") throw new ApiError(404, "not_found", "Resume not found.");
        throw new ApiError(412, "version_conflict", "This resume changed elsewhere. Reload and merge your edits.");
      }
      return json(res.value, 200, requestId, { ETag: etag(res.value.version) });
    }
    if (req.method === "DELETE") {
      // Idempotent: deleting something already gone is still a success for the caller.
      await repo.remove(userId, id);
      return new Response(null, { status: 204, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } });
    }
    throw new ApiError(405, "method_not_allowed", "Method not allowed.", { Allow: "GET, PUT, DELETE" });
  } catch (e) {
    return errorResponse(e, requestId);
  }
}
