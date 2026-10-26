import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticate, mockAuthEnabled } from "@/lib/api/auth";
import { MemoryRateLimiter } from "@/lib/api/ratelimit";
import { MemoryResumeRepo } from "@/lib/api/resume-repo";
import { MemorySnapshotRepo } from "@/lib/api/snapshot-repo";
import { handleSync, type SyncDeps } from "@/lib/api/sync-handler";
import { emptyDraft } from "@/lib/draft-model";
import { emptySnapshot, type Snapshot } from "@/lib/sync/model";

const ALICE = "alice-token";
const BOB = "bob-token";

function setup(withSnapshots = true) {
  const snapshots = new MemorySnapshotRepo();
  const resumes = new MemoryResumeRepo();
  const deps: SyncDeps = {
    auth: async (req) => {
      const t = req.headers.get("authorization");
      const userId = t === `Bearer ${ALICE}` ? "alice" : t === `Bearer ${BOB}` ? "bob" : null;
      return userId ? { userId, repo: resumes, ...(withSnapshots ? { snapshots } : {}) } : null;
    },
    limiter: new MemoryRateLimiter(),
  };
  return { deps, snapshots };
}

const rid = (n: number) => `r-${String(n).padStart(8, "0")}`;
const snap = (name = "Asha", at = 100): Snapshot => {
  const draft = emptyDraft();
  draft.resume.contact.fullName = name;
  return { ...emptySnapshot(), resumes: [{ id: rid(1), name: "Mine", updatedAt: at, draft }] };
};
const call = (method: string, who: string | null, body?: unknown, h: Record<string, string> = {}) =>
  new Request("http://localhost/api/v1/sync", {
    method,
    headers: { host: "localhost", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(who ? { authorization: `Bearer ${who}` } : {}), ...h },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const first = (deps: SyncDeps, who = ALICE, s = snap()) => handleSync(call("PUT", who, s, { "if-none-match": "*" }), deps);

describe("authentication", () => {
  it("every method needs a signed-in user", async () => {
    const { deps } = setup();
    for (const m of ["GET", "PUT", "DELETE"]) {
      for (const who of [null, "garbage"]) {
        const r = await handleSync(call(m, who, m === "PUT" ? snap() : undefined, { "if-none-match": "*" }), deps);
        expect(r.status, `${m} ${who}`).toBe(401);
        expect(r.headers.get("www-authenticate")).toBe("Bearer");
      }
    }
  });

  it("says plainly when sync is not set up on this server", async () => {
    const { deps } = setup(false);
    const r = await handleSync(call("GET", ALICE), deps);
    expect(r.status).toBe(501);
    expect((await r.json()).error.code).toBe("sync_unavailable");
  });

  it("other methods are refused", async () => {
    const { deps } = setup();
    const r = await handleSync(call("POST", ALICE, snap()), deps);
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("GET, PUT, DELETE");
  });
});

describe("saving and reading", () => {
  it("nothing saved yet is a clear 404", async () => {
    const { deps } = setup();
    const r = await handleSync(call("GET", ALICE), deps);
    expect(r.status).toBe(404);
  });

  it("the first save creates version 1, and reading returns it with an ETag", async () => {
    const { deps } = setup();
    const put = await first(deps);
    expect(put.status).toBe(200);
    expect(put.headers.get("etag")).toBe('"v1"');
    const got = await handleSync(call("GET", ALICE), deps);
    expect(got.status).toBe(200);
    expect(got.headers.get("etag")).toBe('"v1"');
    expect(got.headers.get("cache-control")).toContain("no-store");
    const j = await got.json();
    expect(j.version).toBe(1);
    expect(j.snapshot.resumes[0].draft.resume.contact.fullName).toBe("Asha");
  });

  it("an unchanged read is a 304", async () => {
    const { deps } = setup();
    await first(deps);
    const r = await handleSync(call("GET", ALICE, undefined, { "if-none-match": '"v1"' }), deps);
    expect(r.status).toBe(304);
  });

  it("each save moves the version forward", async () => {
    const { deps } = setup();
    await first(deps);
    const r = await handleSync(call("PUT", ALICE, snap("Asha R", 200), { "if-match": '"v1"' }), deps);
    expect(r.status).toBe(200);
    expect(r.headers.get("etag")).toBe('"v2"');
  });
});

describe("concurrent devices: nothing is silently overwritten", () => {
  it("a second 'first save' is refused (412)", async () => {
    const { deps } = setup();
    await first(deps);
    expect((await first(deps)).status).toBe(412);
  });

  it("a save made from a stale version is refused (412), and the stored data is untouched", async () => {
    const { deps, snapshots } = setup();
    await first(deps, ALICE, snap("device A", 100));
    await handleSync(call("PUT", ALICE, snap("device A edit", 200), { "if-match": '"v1"' }), deps); // device A saves: v2
    const stale = await handleSync(call("PUT", ALICE, snap("device B", 150), { "if-match": '"v1"' }), deps); // device B still holds v1
    expect(stale.status).toBe(412);
    expect((await stale.json()).error.code).toBe("version_conflict");
    const stored = await snapshots.get("alice");
    expect(stored!.version).toBe(2);
    expect(stored!.snapshot.resumes[0].draft.resume.contact.fullName).toBe("device A edit");
  });

  it("saving needs a precondition, and a malformed one is rejected", async () => {
    const { deps } = setup();
    expect((await handleSync(call("PUT", ALICE, snap()), deps)).status).toBe(428);
    expect((await handleSync(call("PUT", ALICE, snap(), { "if-match": "banana" }), deps)).status).toBe(400);
    expect((await handleSync(call("PUT", ALICE, snap(), { "if-match": '"v1"' }), deps)).status).toBe(412); // nothing to match yet
  });
});

describe("one user can never see or change another's data", () => {
  it("separate stores per user, in both directions", async () => {
    const { deps } = setup();
    await first(deps, ALICE, snap("Alice"));
    expect((await handleSync(call("GET", BOB), deps)).status).toBe(404);
    await first(deps, BOB, snap("Bob"));
    const a = await (await handleSync(call("GET", ALICE), deps)).json();
    const b = await (await handleSync(call("GET", BOB), deps)).json();
    expect(a.snapshot.resumes[0].draft.resume.contact.fullName).toBe("Alice");
    expect(b.snapshot.resumes[0].draft.resume.contact.fullName).toBe("Bob");
  });

  it("bob's save or delete does not touch alice", async () => {
    const { deps, snapshots } = setup();
    await first(deps, ALICE, snap("Alice"));
    await handleSync(call("PUT", BOB, snap("Bob"), { "if-match": '"v1"' }), deps); // 412: bob has nothing at v1
    await handleSync(call("DELETE", BOB), deps);
    expect((await snapshots.get("alice"))!.snapshot.resumes[0].draft.resume.contact.fullName).toBe("Alice");
  });

  it("the caller's identity comes only from the token, never from the body", async () => {
    const { deps, snapshots } = setup();
    const sneaky = { ...snap("Mallory"), userId: "alice", user_id: "alice" };
    const r = await handleSync(call("PUT", BOB, sneaky, { "if-none-match": "*" }), deps);
    expect(r.status).toBe(400); // unknown fields are rejected outright
    expect(await snapshots.get("alice")).toBeNull();
  });
});

describe("deleting your cloud data", () => {
  it("removes everything, and is safe to repeat", async () => {
    const { deps } = setup();
    await first(deps);
    expect((await handleSync(call("DELETE", ALICE), deps)).status).toBe(204);
    expect((await handleSync(call("GET", ALICE), deps)).status).toBe(404);
    expect((await handleSync(call("DELETE", ALICE), deps)).status).toBe(204);
  });
});

describe("input hardening", () => {
  it("rejects another site's origin on writes, but allows reading without one", async () => {
    const { deps } = setup();
    expect((await handleSync(call("PUT", ALICE, snap(), { "if-none-match": "*", origin: "https://evil.example" }), deps)).status).toBe(403);
    expect((await handleSync(call("DELETE", ALICE, undefined, { origin: "https://evil.example" }), deps)).status).toBe(403);
    expect((await handleSync(call("PUT", ALICE, snap(), { "if-none-match": "*", origin: "http://localhost" }), deps)).status).toBe(200);
  });

  it("requires JSON, caps the size, and rejects broken JSON", async () => {
    const { deps } = setup();
    const raw = (body: string, ct = "application/json") => new Request("http://localhost/api/v1/sync", { method: "PUT", headers: { host: "localhost", authorization: `Bearer ${ALICE}`, "content-type": ct, "if-none-match": "*" }, body });
    expect((await handleSync(raw("{}", "text/plain"), deps)).status).toBe(415);
    expect((await handleSync(raw("{not json"), deps)).status).toBe(400);
    expect((await handleSync(raw(JSON.stringify({ pad: "x".repeat(1_100_000) })), deps)).status).toBe(413);
  });

  it("rejects a malformed snapshot with field names only, never echoing what was sent", async () => {
    const { deps } = setup();
    const secret = "SECRET-VALUE-123";
    const r = await handleSync(call("PUT", ALICE, { v: 1, profile: null, resumes: [{ id: secret, name: "x", updatedAt: 1, draft: {} }], removed: {} }, { "if-none-match": "*" }), deps);
    expect(r.status).toBe(400);
    const text = await r.text();
    expect(text).toContain("validation_failed");
    expect(text).not.toContain(secret);
  });

  it("stores a cleaned copy: control characters and unknown fields in the contents are dropped", async () => {
    const { deps, snapshots } = setup();
    const dirty = { v: 1, profile: null, resumes: [{ id: rid(1), name: "Mine\u0007", updatedAt: 5, draft: { resume: { contact: { fullName: "Asha\u0000", email: "a@" }, isAdmin: true }, evil: 1 } }], removed: {} };
    await handleSync(call("PUT", ALICE, dirty, { "if-none-match": "*" }), deps);
    const stored = JSON.stringify((await snapshots.get("alice"))!.snapshot);
    expect(stored).not.toContain("isAdmin");
    expect(stored).not.toContain("evil");
    expect(stored).not.toContain("\\u0000");
    expect(stored).toContain("Asha");
    expect(stored).toContain("a@"); // an unfinished (invalid-email) resume is kept, not thrown away
  });

  it("limits how fast one user can save", async () => {
    const { deps } = setup();
    await first(deps);
    let blocked = 0;
    for (let i = 0; i < 40; i++) if ((await handleSync(call("PUT", ALICE, snap(), { "if-match": '"v999"' }), deps)).status === 429) blocked++;
    expect(blocked).toBeGreaterThan(0);
  });
});

describe("test-only sign-in can never be on in production", () => {
  afterEach(() => vi.unstubAllEnvs());
  const req = (token: string) => new Request("http://localhost/api/v1/sync", { headers: { authorization: `Bearer ${token}` } });

  it("works only with AUTH_MODE=mock outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_MODE", "mock");
    expect(mockAuthEnabled()).toBe(true);
    const ctx = await authenticate(req("mock.asha-1.x"));
    expect(ctx?.userId).toBe("mock-asha-1");
    expect(ctx?.snapshots).toBeDefined();
    expect(await authenticate(req("mock.BAD NAME.x"))).toBeNull();
    expect(await authenticate(req("mock..x"))).toBeNull();
  });

  it("is off by default, and in production even when AUTH_MODE=mock is set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_MODE", "");
    expect(mockAuthEnabled()).toBe(false);
    expect(await authenticate(req("mock.asha-1.x"))).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_MODE", "mock");
    expect(mockAuthEnabled()).toBe(false);
    expect(await authenticate(req("mock.asha-1.x"))).toBeNull();
  });
});
