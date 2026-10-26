import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseSnapshotRepo } from "@/lib/api/supabase-snapshot-repo";
import { emptySnapshot } from "@/lib/sync/model";

/**
 * The adapter has not been run against a live Supabase project. These tests stub the HTTP layer (PostgREST) to check
 * what it sends and how it reads the answers: the user's own token, filters on their row and version, and that a
 * conflict is reported as a conflict (never as success).
 */
interface Seen {
  url: URL;
  method: string;
  headers: Headers;
  body: unknown;
}
const seen: Seen[] = [];
let respond: (req: Seen) => Response = () => Response.json([]);

beforeEach(() => {
  seen.length = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const s: Seen = { url: new URL(req.url), method: req.method, headers: req.headers, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    seen.push(s);
    return respond(s);
  });
});
afterEach(() => vi.unstubAllGlobals());

const repo = () => new SupabaseSnapshotRepo("https://abc.supabase.co", "anon-key", "user-jwt");
const row = (version: number) => ({ data: emptySnapshot(), version, updated_at: "2026-10-12T00:00:00Z" });

describe("SupabaseSnapshotRepo", () => {
  it("every request carries the user's own token (so row-level security applies) and targets user_data", async () => {
    respond = () => Response.json([row(1)]);
    await repo().get("u1").catch(() => undefined);
    const r = seen[0];
    expect(r.headers.get("authorization")).toBe("Bearer user-jwt");
    expect(r.headers.get("apikey")).toBe("anon-key");
    expect(r.url.pathname).toBe("/rest/v1/user_data");
  });

  it("reads only the caller's own row", async () => {
    respond = () => Response.json([row(3)]);
    await repo().get("u1").catch(() => undefined);
    expect(seen[0].url.searchParams.get("user_id")).toBe("eq.u1");
  });

  it("the first save inserts (POST) for the caller, and a unique-violation answer is a conflict, not success", async () => {
    respond = () => Response.json({ code: "23505", message: "duplicate key" }, { status: 409 });
    const r = await repo().put("u1", emptySnapshot(), null);
    expect(r).toEqual({ ok: false, reason: "version_conflict" });
    expect(seen[0].method).toBe("POST");
    expect((seen[0].body as { user_id: string }).user_id).toBe("u1");
  });

  it("a later save is a compare-and-swap on user and version; no row updated means conflict", async () => {
    respond = () => Response.json([]); // PostgREST: zero rows matched the filter
    const r = await repo().put("u1", emptySnapshot(), 4);
    expect(r).toEqual({ ok: false, reason: "version_conflict" });
    expect(seen[0].method).toBe("PATCH");
    expect(seen[0].url.searchParams.get("user_id")).toBe("eq.u1");
    expect(seen[0].url.searchParams.get("version")).toBe("eq.4");
  });

  it("one updated row is success and returns the new version", async () => {
    respond = () => Response.json([row(5)]);
    const r = await repo().put("u1", emptySnapshot(), 4);
    expect(r).toMatchObject({ ok: true, value: { version: 5 } });
  });

  it("a database error is an error, never a silent success or a fake conflict", async () => {
    respond = () => Response.json({ code: "XX000", message: "boom" }, { status: 500 });
    await expect(repo().put("u1", emptySnapshot(), 4)).rejects.toThrow("db_error");
    await expect(repo().put("u1", emptySnapshot(), null)).rejects.toThrow("db_error");
    await expect(repo().get("u1")).rejects.toThrow("db_error");
  });

  it("deleting removes only the caller's row", async () => {
    respond = () => new Response(null, { status: 204, headers: { "content-range": "*/1" } });
    await repo().remove("u1").catch(() => undefined);
    expect(seen[0].method).toBe("DELETE");
    expect(seen[0].url.searchParams.get("user_id")).toBe("eq.u1");
  });
});
