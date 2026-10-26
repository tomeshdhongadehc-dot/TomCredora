import { randomUUID } from "node:crypto";
import { MAX_SNAPSHOT_BYTES, sanitizeSnapshot, snapshotSchema } from "@/lib/sync/model";
import { ApiError, errorResponse } from "./errors";
import { assertSameOrigin, readJson } from "./guard";
import type { RateLimiter } from "./ratelimit";
import type { AuthContext } from "./resumes-handler";

export interface SyncDeps {
  /** Verifies the caller and returns their scoped storage; null = unauthenticated. */
  auth: (req: Request) => Promise<AuthContext | null>;
  limiter: RateLimiter;
}

const etag = (v: number) => `"v${v}"`;
const parseEtag = (h: string | null) => {
  const m = /^"?v(\d{1,9})"?$/.exec(h?.trim() ?? "");
  return m ? Number(m[1]) : null;
};
const json = (body: unknown, status: number, requestId: string, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestId, ...extra } });

/**
 * GET / PUT / DELETE /api/v1/sync: the signed-in user's synced data (profile + resumes).
 *  GET    the stored snapshot and its version (ETag), or 404 when nothing is saved yet.
 *  PUT    save it. Needs `If-Match: "vN"` (the version last seen) or `If-None-Match: *` (first save).
 *         412 if someone else saved in between: the client re-reads, merges and tries again, so nothing is lost.
 *  DELETE remove everything stored for this user ("delete my cloud data").
 */
export async function handleSync(req: Request, deps: SyncDeps): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  try {
    if (!["GET", "PUT", "DELETE"].includes(req.method)) throw new ApiError(405, "method_not_allowed", "Method not allowed.", { Allow: "GET, PUT, DELETE" });
    const write = req.method !== "GET";
    if (write) assertSameOrigin(req);
    const ctx = await deps.auth(req);
    if (!ctx) throw new ApiError(401, "unauthenticated", "Sign in to continue.", { "WWW-Authenticate": "Bearer" });
    if (!ctx.snapshots) throw new ApiError(501, "sync_unavailable", "Sync is not available on this server.");
    await deps.limiter.check(`sync:${write ? "w" : "r"}:${ctx.userId}`, write ? 30 : 120, 60_000);
    const { snapshots, userId } = ctx;

    if (req.method === "GET") {
      const stored = await snapshots.get(userId);
      if (!stored) throw new ApiError(404, "not_found", "Nothing saved yet.");
      if (parseEtag(req.headers.get("if-none-match")) === stored.version) {
        return new Response(null, { status: 304, headers: { ETag: etag(stored.version), "Cache-Control": "private, no-cache" } });
      }
      return json(stored, 200, requestId, { ETag: etag(stored.version) });
    }

    if (req.method === "PUT") {
      const create = req.headers.get("if-none-match")?.trim() === "*";
      const ifMatch = req.headers.get("if-match");
      if (!create && ifMatch === null) throw new ApiError(428, "precondition_required", "Send If-Match with the version you last received, or If-None-Match: * for the first save.");
      const expected = create ? null : parseEtag(ifMatch);
      if (!create && expected === null) throw new ApiError(400, "invalid_if_match", "If-Match must be a version from a previous response.");

      const parsed = snapshotSchema.safeParse(await readJson(req, MAX_SNAPSHOT_BYTES + 4096));
      if (!parsed.success) {
        const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(root)"))].slice(0, 10);
        throw new ApiError(400, "validation_failed", `Invalid fields: ${fields.join(", ")}`);
      }
      const clean = sanitizeSnapshot(parsed.data);
      if (new TextEncoder().encode(JSON.stringify(clean)).length > MAX_SNAPSHOT_BYTES) throw new ApiError(413, "payload_too_large", "Your data is too large to sync.");

      const res = await snapshots.put(userId, clean, expected);
      if (!res.ok) throw new ApiError(412, "version_conflict", "Your data changed on another device. Reload to merge.");
      return json({ version: res.value.version, updatedAt: res.value.updatedAt }, 200, requestId, { ETag: etag(res.value.version) });
    }

    // DELETE: idempotent, removing nothing is still a success.
    await snapshots.remove(userId);
    return new Response(null, { status: 204, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, requestId);
  }
}
