import { ApiError } from "./errors";

export const MAX_BODY_BYTES = 64 * 1024;

/** CSRF defence for cookie-authenticated mutations: Origin must match our host. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, server-to-server) send no Origin
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ok = false;
  try {
    ok = new URL(origin).host === host;
  } catch {
    /* malformed origin -> reject */
  }
  if (!ok) throw new ApiError(403, "bad_origin", "Cross-origin requests are not allowed.");
}

/** Enforce JSON content type and a hard body size cap (also when Content-Length lies). */
export async function readJson(req: Request, max = MAX_BODY_BYTES): Promise<unknown> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json"))
    throw new ApiError(415, "unsupported_media_type", "Content-Type must be application/json.");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) throw new ApiError(413, "payload_too_large", "Request body too large.");
  const text = await req.text();
  if (new TextEncoder().encode(text).length > max) throw new ApiError(413, "payload_too_large", "Request body too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body is not valid JSON.");
  }
}

export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
