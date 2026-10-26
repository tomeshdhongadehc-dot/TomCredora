import { describe, expect, it } from "vitest";
import { MemoryIdempotencyStore } from "@/lib/api/idempotency";
import { MemoryRateLimiter } from "@/lib/api/ratelimit";
import { MemoryResumeRepo } from "@/lib/api/resume-repo";
import { handleCollection, handleItem, type ResumesDeps } from "@/lib/api/resumes-handler";
import { DEFAULT_CONFIG } from "@/lib/templates";
import { SAMPLE_RESUME } from "./fixtures";

const ALICE = "alice-token";
const BOB = "bob-token";

function setup() {
  const repo = new MemoryResumeRepo();
  const deps: ResumesDeps = {
    repo,
    auth: async (req: Request) => {
      const t = req.headers.get("authorization");
      const userId = t === `Bearer ${ALICE}` ? "alice" : t === `Bearer ${BOB}` ? "bob" : null;
      return userId ? { userId, repo } : null;
    },
    store: new MemoryIdempotencyStore(),
    limiter: new MemoryRateLimiter(),
  } as ResumesDeps & { repo: MemoryResumeRepo };
  return deps;
}

const body = { title: "Acme application", data: SAMPLE_RESUME, template: DEFAULT_CONFIG };
const call = (path: string, method: string, who: string | null, b?: unknown, h: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { host: "localhost", "content-type": "application/json", ...(who ? { authorization: `Bearer ${who}` } : {}), ...h },
    body: b === undefined ? undefined : JSON.stringify(b),
  });
const KEY = "0123456789abcdef0123";

async function create(deps: ResumesDeps, who = ALICE, key = KEY) {
  const r = await handleCollection(call("/api/v1/resumes", "POST", who, body, { "idempotency-key": key }), deps);
  return { res: r, json: await r.json() };
}
const item = (deps: ResumesDeps, id: string, method: string, who: string | null, b?: unknown, h: Record<string, string> = {}) =>
  handleItem(call(`/api/v1/resumes/${id}`, method, who, b, h), id, deps);

describe("authentication", () => {
  it("rejects unauthenticated and bad tokens on every route", async () => {
    const deps = setup();
    for (const who of [null, "garbage"]) {
      expect((await handleCollection(call("/api/v1/resumes", "GET", who), deps)).status).toBe(401);
      expect((await handleCollection(call("/api/v1/resumes", "POST", who, body, { "idempotency-key": KEY }), deps)).status).toBe(401);
      expect((await item(deps, crypto.randomUUID(), "GET", who)).status).toBe(401);
    }
  });
});

describe("create / read / update / delete", () => {
  it("creates with ETag + Location and reads back", async () => {
    const deps = setup();
    const { res, json } = await create(deps);
    expect(res.status).toBe(201);
    expect(res.headers.get("etag")).toBe('"v1"');
    expect(res.headers.get("location")).toBe(`/api/v1/resumes/${json.id}`);
    const got = await item(deps, json.id, "GET", ALICE);
    expect(got.status).toBe(200);
    expect((await got.json()).data.contact.fullName).toBe("Asha Rao");
  });

  it("create is idempotent: same key returns the same resume, no duplicate", async () => {
    const deps = setup();
    const a = await create(deps);
    const b = await create(deps);
    expect(b.res.headers.get("idempotent-replay")).toBe("true");
    expect(b.json.id).toBe(a.json.id);
    const list = await (await handleCollection(call("/api/v1/resumes", "GET", ALICE), deps)).json();
    expect(list.items).toHaveLength(1);
  });

  it("update requires If-Match, bumps the version, and detects stale writes", async () => {
    const deps = setup();
    const { json } = await create(deps);
    const noHeader = await item(deps, json.id, "PUT", ALICE, { title: "New" });
    expect(noHeader.status).toBe(428);
    expect((await item(deps, json.id, "PUT", ALICE, { title: "New" }, { "if-match": "banana" })).status).toBe(400);

    const ok = await item(deps, json.id, "PUT", ALICE, { title: "Renamed" }, { "if-match": '"v1"' });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("etag")).toBe('"v2"');

    const stale = await item(deps, json.id, "PUT", ALICE, { title: "Lost update" }, { "if-match": '"v1"' });
    expect(stale.status).toBe(412);
    expect((await (await item(deps, json.id, "GET", ALICE)).json()).title).toBe("Renamed");
  });

  it("supports conditional GET (304)", async () => {
    const deps = setup();
    const { json } = await create(deps);
    const r = await item(deps, json.id, "GET", ALICE, undefined, { "if-none-match": '"v1"' });
    expect(r.status).toBe(304);
  });

  it("delete is idempotent and hides the resume", async () => {
    const deps = setup();
    const { json } = await create(deps);
    expect((await item(deps, json.id, "DELETE", ALICE)).status).toBe(204);
    expect((await item(deps, json.id, "DELETE", ALICE)).status).toBe(204);
    expect((await item(deps, json.id, "GET", ALICE)).status).toBe(404);
    expect((await item(deps, json.id, "PUT", ALICE, { title: "x" }, { "if-match": '"v1"' })).status).toBe(404);
  });
});

describe("authorization (IDOR) - users can never touch each other's data", () => {
  it("Bob cannot read, update or delete Alice's resume, and gets the same 404 as a missing id", async () => {
    const deps = setup();
    const { json } = await create(deps, ALICE);
    const missing = await item(deps, crypto.randomUUID(), "GET", BOB);
    const get = await item(deps, json.id, "GET", BOB);
    const put = await item(deps, json.id, "PUT", BOB, { title: "pwned" }, { "if-match": '"v1"' });
    const del = await item(deps, json.id, "DELETE", BOB);
    expect(get.status).toBe(404);
    expect(put.status).toBe(404);
    expect(await get.json()).toMatchObject({ error: { code: (await missing.json()).error.code } });
    expect(del.status).toBe(204); // idempotent, but must not have deleted anything
    const still = await item(deps, json.id, "GET", ALICE);
    expect(still.status).toBe(200);
    expect((await still.json()).title).toBe("Acme application");
  });

  it("lists only the caller's resumes", async () => {
    const deps = setup();
    await create(deps, ALICE, "alice-key-0123456789");
    await create(deps, BOB, "bob-key-0123456789ab");
    const list = await (await handleCollection(call("/api/v1/resumes", "GET", BOB), deps)).json();
    expect(list.items).toHaveLength(1);
  });

  it("idempotency keys are namespaced per user (no cross-user replay)", async () => {
    const deps = setup();
    const a = await create(deps, ALICE, KEY);
    const b = await create(deps, BOB, KEY);
    expect(b.res.headers.get("idempotent-replay")).toBe("false");
    expect(b.json.id).not.toBe(a.json.id);
  });

  it("mass assignment: user_id / version / id in the body are rejected", async () => {
    const deps = setup();
    for (const extra of [{ user_id: "alice" }, { userId: "alice" }, { version: 99 }, { id: "x" }]) {
      const r = await handleCollection(call("/api/v1/resumes", "POST", BOB, { ...body, ...extra }, { "idempotency-key": "k-" + Math.random().toString(36).slice(2).padEnd(16, "0") }), deps);
      expect(r.status).toBe(400);
    }
  });
});

describe("validation and hardening", () => {
  it("rejects invalid resume data, bad templates and empty updates", async () => {
    const deps = setup();
    const bad = (o: object, key: string) => handleCollection(call("/api/v1/resumes", "POST", ALICE, { ...body, ...o }, { "idempotency-key": key }), deps);
    expect((await bad({ title: "" }, "k1-aaaaaaaaaaaaaaaaaaa")).status).toBe(400);
    expect((await bad({ title: "x".repeat(121) }, "k2-aaaaaaaaaaaaaaaaaaa")).status).toBe(400);
    expect((await bad({ template: { ...DEFAULT_CONFIG, sizePt: 99 } }, "k3-aaaaaaaaaaaaaaaaaaa")).status).toBe(400);
    expect((await bad({ data: { ...SAMPLE_RESUME, contact: { ...SAMPLE_RESUME.contact, email: "nope" } } }, "k4-aaaaaaaaaaaaaaaaaaa")).status).toBe(400);
    const { json } = await create(deps);
    expect((await item(deps, json.id, "PUT", ALICE, {}, { "if-match": '"v1"' })).status).toBe(400);
  });

  it("malformed ids are 404, never a server error (SQL-ish payloads)", async () => {
    const deps = setup();
    for (const id of ["1", "abc", "' OR 1=1 --", "../../etc/passwd", "00000000-0000-0000-0000-00000000000g"]) {
      expect((await item(deps, encodeURIComponent(id), "GET", ALICE)).status, id).toBe(404);
    }
  });

  it("blocks cross-origin writes and wrong content types, requires Idempotency-Key on create", async () => {
    const deps = setup();
    expect((await handleCollection(call("/api/v1/resumes", "POST", ALICE, body, { origin: "https://evil.example", "idempotency-key": KEY }), deps)).status).toBe(403);
    expect((await handleCollection(call("/api/v1/resumes", "POST", ALICE, body, { "content-type": "text/plain", "idempotency-key": KEY }), deps)).status).toBe(415);
    expect((await handleCollection(call("/api/v1/resumes", "POST", ALICE, body), deps)).status).toBe(400);
  });

  it("rejects oversized bodies", async () => {
    const deps = setup();
    const big = { ...body, title: "x".repeat(300_000) };
    expect((await handleCollection(call("/api/v1/resumes", "POST", ALICE, big, { "idempotency-key": KEY }), deps)).status).toBe(413);
  });

  it("paginates with a cursor and caps the page size", async () => {
    let t = 1_700_000_000_000;
    const repo = new MemoryResumeRepo(() => new Date((t += 1000)));
    const deps: ResumesDeps = { auth: async () => ({ userId: "alice", repo }), store: new MemoryIdempotencyStore(), limiter: new MemoryRateLimiter() };
    for (let i = 0; i < 5; i++) await repo.create("alice", { title: `R${i}`, data: SAMPLE_RESUME, template: DEFAULT_CONFIG });
    const p1 = await (await handleCollection(call("/api/v1/resumes?limit=2", "GET", ALICE), deps)).json();
    expect(p1.items.map((x: { title: string }) => x.title)).toEqual(["R4", "R3"]);
    const p2 = await (await handleCollection(call(`/api/v1/resumes?limit=2&before=${encodeURIComponent(p1.next)}`, "GET", ALICE), deps)).json();
    expect(p2.items.map((x: { title: string }) => x.title)).toEqual(["R2", "R1"]);
    expect((await handleCollection(call("/api/v1/resumes?before=garbage", "GET", ALICE), deps)).status).toBe(400);
    const huge = await (await handleCollection(call("/api/v1/resumes?limit=9999", "GET", ALICE), deps)).json();
    expect(huge.items.length).toBeLessThanOrEqual(50);
  });

  it("never leaks internals on unexpected errors", async () => {
    const deps = setup();
    deps.auth = async () => ({ userId: "alice", repo: { list: async () => { throw new Error("password=hunter2 at /srv/db.ts:42"); } } as never });
    const r = await handleCollection(call("/api/v1/resumes", "GET", ALICE), deps);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toMatch(/hunter2|\/srv|db\.ts/);
  });

  it("rate limits writes per user", async () => {
    const deps = setup();
    let last = 0;
    for (let i = 0; i < 62; i++) last = (await handleCollection(call("/api/v1/resumes", "POST", ALICE, body, { "idempotency-key": `rl-${String(i).padStart(18, "0")}` }), deps)).status;
    expect(last).toBe(429);
  });
});
