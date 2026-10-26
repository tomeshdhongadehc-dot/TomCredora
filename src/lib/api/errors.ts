/** Uniform error type: safe message + stable code. Never leaks internals. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(e: unknown, requestId: string): Response {
  const err = e instanceof ApiError ? e : new ApiError(500, "internal", "Something went wrong");
  if (!(e instanceof ApiError)) console.error(JSON.stringify({ requestId, error: e instanceof Error ? e.name : "unknown" }));
  return Response.json(
    { error: { code: err.code, message: err.message, requestId } },
    { status: err.status, headers: { "Cache-Control": "no-store", ...err.headers } },
  );
}
