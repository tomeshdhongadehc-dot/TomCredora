import { randomUUID } from "node:crypto";
import { extractText, MAX_UPLOAD_BYTES, sniff } from "@/lib/import/extract";
import { ApiError, errorResponse } from "./errors";
import { assertSameOrigin, clientIp } from "./guard";
import type { RateLimiter } from "./ratelimit";

export interface ImportDeps {
  limiter: RateLimiter;
  /** injectable so tests need no real PDF engine */
  extract?: typeof extractText;
  timeoutMs?: number;
}

const ALLOWED_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"];

/**
 * Upload a PDF or Word resume (the raw file as the request body) and get its text back. The text is read in
 * memory and returned; the file is never written anywhere. Whether it is really a PDF or Word file is decided
 * from its first bytes, not from its name or declared type.
 */
export async function handleImportFile(req: Request, deps: ImportDeps): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  try {
    assertSameOrigin(req);
    const who = `ip:${clientIp(req)}`;
    await deps.limiter.check(`import:min:${who}`, 8, 60_000);
    await deps.limiter.check(`import:day:${who}`, 60, 86_400_000);

    const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(type)) throw new ApiError(415, "unsupported_media_type", "Upload a PDF or Word (.docx) file.");
    if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) throw new ApiError(413, "payload_too_large", "That file is too large. The limit is 4 MB.");
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > MAX_UPLOAD_BYTES) throw new ApiError(413, "payload_too_large", "That file is too large. The limit is 4 MB.");
    if (bytes.length === 0) throw new ApiError(400, "empty_file", "That file is empty.");
    const kind = sniff(bytes);
    if (!kind) throw new ApiError(415, "unsupported_media_type", "That does not look like a PDF or Word (.docx) file. Older .doc files are not supported: save it as .docx or PDF.");

    let text: string;
    try {
      text = await Promise.race([
        (deps.extract ?? extractText)(bytes, kind),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), deps.timeoutMs ?? 20_000)),
      ]);
    } catch {
      throw new ApiError(422, "unreadable_file", "We could not read that file. It may be damaged or password-protected. You can paste the text of your resume instead.");
    }
    if (text.replace(/\s+/g, "").length < 40)
      throw new ApiError(422, "no_text", "That file has no text we can read (it may be a scanned picture). Paste the text of your resume instead.");

    return Response.json({ text, kind }, { headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestId } });
  } catch (e) {
    return errorResponse(e, requestId);
  }
}
