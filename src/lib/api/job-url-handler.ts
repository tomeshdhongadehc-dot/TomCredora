import { randomUUID } from "node:crypto";
import { z } from "zod";
import { extractJob } from "@/lib/job-extract";
import { ApiError, errorResponse } from "./errors";
import { assertSameOrigin, clientIp, readJson } from "./guard";
import type { RateLimiter } from "./ratelimit";
import { FetchRefused, safeFetch, type Fetched } from "./safe-fetch";

export const jobUrlSchema = z.strictObject({ url: z.string().min(8).max(2000) });

export interface JobUrlDeps {
  limiter: RateLimiter;
  /** injectable so tests never touch the network */
  fetchPage?: (url: string) => Promise<Fetched>;
}

/**
 * Read a job posting from a link. The server fetches the page (under the strict rules in safe-fetch) and returns the
 * posting text for the person to look over: it goes into the job description box, nothing is sent to the AI here.
 */
export async function handleJobUrl(req: Request, deps: JobUrlDeps): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  try {
    assertSameOrigin(req);
    const who = `ip:${clientIp(req)}`;
    await deps.limiter.check(`joburl:min:${who}`, 8, 60_000);
    await deps.limiter.check(`joburl:day:${who}`, 80, 86_400_000);

    const parsed = jobUrlSchema.safeParse(await readJson(req, 4096));
    if (!parsed.success) throw new ApiError(400, "validation_failed", "Paste the full web address of the job.");

    let page: Fetched;
    try {
      page = await (deps.fetchPage ?? safeFetch)(parsed.data.url);
    } catch (e) {
      if (e instanceof FetchRefused) throw new ApiError(e.code === "blocked" || e.code === "bad_url" ? 400 : 422, `link_${e.code}`, e.message);
      throw new ApiError(422, "link_unreachable", "We could not reach that page.");
    }
    const job = extractJob(page.body);
    if (!job) throw new ApiError(422, "link_unreadable", "That page did not give us the job text. Many job sites need you to be signed in. Please copy the job description and paste it instead.");

    let host = "";
    try {
      host = new URL(page.url).hostname;
    } catch {
      /* leave blank */
    }
    return Response.json(
      { text: job.text, title: job.title, company: job.company, host, via: job.via, truncated: page.truncated },
      { headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestId } },
    );
  } catch (e) {
    return errorResponse(e, requestId);
  }
}
