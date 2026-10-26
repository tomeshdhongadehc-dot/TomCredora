import { describe, expect, it } from "vitest";
import { MemoryRateLimiter } from "@/lib/api/ratelimit";
import { MemoryResumeRepo } from "@/lib/api/resume-repo";
import { MemorySnapshotRepo } from "@/lib/api/snapshot-repo";
import { handleSync } from "@/lib/api/sync-handler";
import { emptyDraft, hasContent, type Draft } from "@/lib/draft-model";
import { profileFromResume, loadProfile, saveProfile } from "@/lib/profile";
import { SAMPLE_RESUME } from "@/lib/sample";
import { syncOnce, type SyncDeps } from "@/lib/sync/engine";
import { readLocalSnapshot } from "@/lib/sync/local";
import { recordRemoval } from "@/lib/sync/removed";
import { loadDraft, loadWorkspace, parseIndex, saveDraft, saveIndex, INDEX_KEY, type StorageLike } from "@/lib/workspace";

/** A browser's storage. */
const browser = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

/** One account on the real server handler; each "device" is a browser storage pointed at it. */
function account(user = "asha") {
  const snapshots = new MemorySnapshotRepo();
  const resumes = new MemoryResumeRepo();
  const limiter = new MemoryRateLimiter();
  const handler = (req: Request) => handleSync(req, { limiter, auth: async (r) => (r.headers.get("authorization") === `Bearer tok-${user}` ? { userId: user, repo: resumes, snapshots } : null) });
  const serverFetch = (url: string, init?: RequestInit) => handler(new Request(`http://localhost${url}`, { ...init, headers: { host: "localhost", ...(init?.headers as Record<string, string>) } }));
  return { snapshots, serverFetch };
}

const rid = (n: number) => `r-${String(n).padStart(8, "0")}`;
const draftNamed = (name: string, role = "Engineer"): Draft => {
  const d = emptyDraft();
  d.resume.contact.fullName = name;
  d.resume.experience = [{ id: `e-${name}`, company: "Acme", role, location: "", start: "2020", end: "2021", bullets: ["Did things"] }];
  return d;
};
/** Put resumes on a device. `updatedAt` is explicit so tests control "which edit is newer". */
function give(s: StorageLike, items: { n: number; name?: string; at: number; draft?: Draft }[], activeId?: string) {
  const idx = parseIndex(JSON.parse(s.getItem(INDEX_KEY) ?? "null")) ?? { activeId: "", items: [] };
  for (const it of items) {
    saveDraft(s, rid(it.n), it.draft ?? draftNamed(`R${it.n}`));
    idx.items = [...idx.items.filter((x) => x.id !== rid(it.n)), { id: rid(it.n), name: it.name ?? `Resume ${it.n}`, updatedAt: it.at }];
  }
  idx.activeId = activeId ?? idx.activeId ?? rid(items[0].n);
  if (!idx.items.some((i) => i.id === idx.activeId)) idx.activeId = idx.items[0].id;
  saveIndex(s, idx);
}
const names = (s: StorageLike) => readLocalSnapshot(s).resumes.map((r) => r.draft.resume.contact.fullName).sort();
const sync = (s: StorageLike, a: ReturnType<typeof account>, over: Partial<SyncDeps> = {}) => syncOnce({ storage: s, fetch: a.serverFetch, token: () => "tok-asha", ...over });

describe("signing in for the first time", () => {
  it("a device with data and an empty account uploads everything", async () => {
    const acc = account();
    const a = browser();
    give(a, [{ n: 1, at: 100 }, { n: 2, at: 200 }]);
    saveProfile(a, profileFromResume(SAMPLE_RESUME, "software"));
    const r = await sync(a, acc);
    expect(r).toMatchObject({ state: "synced", pushed: true, pulled: false });
    const stored = (await acc.snapshots.get("asha"))!;
    expect(stored.snapshot.resumes.map((x) => x.id).sort()).toEqual([rid(1), rid(2)]);
    expect(stored.snapshot.profile?.data.resume.contact.fullName).toBe("Asha Rao");
    expect(stored.version).toBe(1);
  });

  it("a brand-new device gets the account's data, and no stray empty resume", async () => {
    const acc = account();
    const a = browser();
    give(a, [{ n: 1, at: 100 }, { n: 2, at: 200 }]);
    saveProfile(a, profileFromResume(SAMPLE_RESUME, "software"));
    await sync(a, acc);

    const b = browser();
    loadWorkspace(b); // what the app does on first open: one empty default resume
    expect(parseIndex(JSON.parse(b.getItem(INDEX_KEY)!))!.items).toHaveLength(1);
    const r = await sync(b, acc);
    expect(r).toMatchObject({ state: "synced", pulled: true, pushed: false });
    const idx = parseIndex(JSON.parse(b.getItem(INDEX_KEY)!))!;
    expect(idx.items.map((i) => i.id).sort()).toEqual([rid(1), rid(2)]);
    expect(idx.items.some((i) => !hasContent(loadDraft(b, i.id)!.resume))).toBe(false);
    expect(idx.items.some((i) => i.id === idx.activeId)).toBe(true);
    expect(loadProfile(b)?.resume.contact.fullName).toBe("Asha Rao");
  });

  it("an empty new device never wipes or changes the account", async () => {
    const acc = account();
    const a = browser();
    give(a, [{ n: 1, at: 100 }]);
    await sync(a, acc);
    const before = JSON.stringify((await acc.snapshots.get("asha"))!.snapshot);
    const b = browser();
    loadWorkspace(b);
    await sync(b, acc);
    expect(JSON.stringify((await acc.snapshots.get("asha"))!.snapshot)).toBe(before);
    expect((await acc.snapshots.get("asha"))!.version).toBe(1);
  });

  it("an empty device and an empty account: nothing is created", async () => {
    const acc = account();
    const b = browser();
    loadWorkspace(b);
    expect(await sync(b, acc)).toMatchObject({ state: "synced", pushed: false, pulled: false });
    expect(await acc.snapshots.get("asha")).toBeNull();
  });
});

describe("two devices working on the same account", () => {
  it("an edit on one device reaches the other", async () => {
    const acc = account();
    const a = browser();
    give(a, [{ n: 1, at: 100, draft: draftNamed("Original") }]);
    await sync(a, acc);
    const b = browser();
    await sync(b, acc);
    give(b, [{ n: 1, at: 500, draft: draftNamed("Edited on B") }]);
    await sync(b, acc);
    await sync(a, acc);
    expect(names(a)).toEqual(["Edited on B"]);
  });

  it("changes to DIFFERENT resumes on each device are both kept", async () => {
    const acc = account();
    const a = browser();
    give(a, [{ n: 1, at: 100 }, { n: 2, at: 100 }]);
    await sync(a, acc);
    const b = browser();
    await sync(b, acc);
    give(a, [{ n: 1, at: 300, draft: draftNamed("A edited one") }]);
    give(b, [{ n: 2, at: 400, draft: draftNamed("B edited two") }]);
    await sync(a, acc);
    await sync(b, acc);
    await sync(a, acc);
    expect(names(a)).toEqual(["A edited one", "B edited two"]);
    expect(names(b)).toEqual(["A edited one", "B edited two"]);
  });

  it("the SAME resume edited on both: the newer edit wins, on both devices", async () => {
    const acc = account();
    const a = browser();
    give(a, [{ n: 1, at: 100 }]);
    await sync(a, acc);
    const b = browser();
    await sync(b, acc);
    give(a, [{ n: 1, at: 300, draft: draftNamed("older edit") }]);
    give(b, [{ n: 1, at: 900, draft: draftNamed("newer edit") }]);
    await sync(a, acc);
    await sync(b, acc);
    await sync(a, acc);
    expect(names(a)).toEqual(["newer edit"]);
    expect(names(b)).toEqual(["newer edit"]);
  });

  it("a resume deleted on one device is deleted on the other and does not come back", async () => {
    const acc = account();
    const a = browser();
    give(a, [{ n: 1, at: 100 }, { n: 2, at: 100 }]);
    await sync(a, acc);
    const b = browser();
    await sync(b, acc);
    // delete resume 2 on device B
    const idx = parseIndex(JSON.parse(b.getItem(INDEX_KEY)!))!;
    saveIndex(b, { ...idx, activeId: rid(1), items: idx.items.filter((i) => i.id !== rid(2)) });
    b.removeItem(`arb.resume.${rid(2)}`);
    recordRemoval(b, rid(2), 1000);
    await sync(b, acc);
    await sync(a, acc);
    expect(readLocalSnapshot(a).resumes.map((r) => r.id)).toEqual([rid(1)]);
    await sync(a, acc);
    await sync(b, acc);
    expect(readLocalSnapshot(a).resumes.map((r) => r.id)).toEqual([rid(1)]);
    expect(readLocalSnapshot(b).resumes.map((r) => r.id)).toEqual([rid(1)]);
    expect(Object.keys((await acc.snapshots.get("asha"))!.snapshot.removed)).toEqual([rid(2)]);
  });

  it("the newer profile wins", async () => {
    const acc = account();
    const a = browser();
    const p1 = profileFromResume(SAMPLE_RESUME);
    p1.resume.contact.location = "Old city";
    saveProfile(a, p1);
    await sync(a, acc);
    const b = browser();
    await sync(b, acc);
    const p2 = profileFromResume(SAMPLE_RESUME);
    p2.resume.contact.location = "New city";
    await new Promise((r) => setTimeout(r, 5));
    saveProfile(b, p2);
    await sync(b, acc);
    await sync(a, acc);
    expect(loadProfile(a)?.resume.contact.location).toBe("New city");
  });

  it("syncing again with nothing changed does nothing (no new version)", async () => {
    const acc = account();
    const a = browser();
    give(a, [{ n: 1, at: 100 }]);
    await sync(a, acc);
    const v = (await acc.snapshots.get("asha"))!.version;
    for (let i = 0; i < 3; i++) expect(await sync(a, acc)).toMatchObject({ state: "synced", pushed: false, pulled: false });
    expect((await acc.snapshots.get("asha"))!.version).toBe(v);
  });

  it("the open resume stays open after a sync", async () => {
    const acc = account();
    const a = browser();
    give(a, [{ n: 1, at: 100 }, { n: 2, at: 200 }], rid(1));
    await sync(a, acc);
    const b = browser();
    give(b, [{ n: 3, at: 50 }], rid(3));
    await sync(b, acc);
    expect(parseIndex(JSON.parse(b.getItem(INDEX_KEY)!))!.activeId).toBe(rid(3));
  });
});

describe("races", () => {
  it("another device saving between our read and our save causes a re-merge, not a lost edit", async () => {
    const acc = account();
    const a = browser();
    give(a, [{ n: 1, at: 100 }]);
    await sync(a, acc);

    const b = browser();
    await sync(b, acc);
    give(b, [{ n: 2, at: 700, draft: draftNamed("added by B while A syncs") }]);
    give(a, [{ n: 1, at: 300, draft: draftNamed("A edit") }]);

    // On A's save, B gets in first.
    let raced = false;
    const racing: SyncDeps["fetch"] = async (url, init) => {
      if (init?.method === "PUT" && !raced) {
        raced = true;
        await sync(b, acc);
      }
      return acc.serverFetch(url, init);
    };
    const r = await sync(a, acc, { fetch: racing });
    expect(r.state).toBe("synced");
    expect(raced).toBe(true);
    expect(names(a)).toEqual(["A edit", "added by B while A syncs"]);
    const stored = (await acc.snapshots.get("asha"))!.snapshot.resumes.map((x) => x.draft.resume.contact.fullName).sort();
    expect(stored).toEqual(["A edit", "added by B while A syncs"]);
  });

  it("an edit made here while the sync is waiting on the network is never overwritten", async () => {
    const acc = account();
    const a = browser();
    give(a, [{ n: 1, at: 100, draft: draftNamed("base") }]);
    await sync(a, acc);
    const b = browser();
    await sync(b, acc);
    give(b, [{ n: 1, at: 400, draft: draftNamed("B's newer text") }]);
    await sync(b, acc);

    // while A waits for the cloud copy, the user types
    let typed = false;
    const slow: SyncDeps["fetch"] = async (url, init) => {
      const res = await acc.serverFetch(url, init);
      if (init?.method === "GET" && !typed) {
        typed = true;
        give(a, [{ n: 1, at: 900, draft: draftNamed("typed during sync") }]);
      }
      return res;
    };
    await sync(a, acc, { fetch: slow });
    expect(names(a)).toEqual(["typed during sync"]);
    await sync(b, acc);
    expect(names(b)).toEqual(["typed during sync"]);
  });

  it("pending edits are flushed to storage before the sync reads it", async () => {
    const acc = account();
    const a = browser();
    give(a, [{ n: 1, at: 100 }]);
    let flushed = 0;
    await sync(a, acc, { flush: () => { flushed++; give(a, [{ n: 1, at: 200, draft: draftNamed("flushed edit") }]); } });
    expect(flushed).toBeGreaterThan(0);
    expect((await acc.snapshots.get("asha"))!.snapshot.resumes[0].draft.resume.contact.fullName).toBe("flushed edit");
  });
});

describe("when something goes wrong, local data is untouched", () => {
  const seeded = () => {
    const a = browser();
    give(a, [{ n: 1, at: 100, draft: draftNamed("precious") }]);
    saveProfile(a, profileFromResume(SAMPLE_RESUME));
    return a;
  };
  const snapshotOf = (s: StorageLike) => JSON.stringify([...(s as ReturnType<typeof browser>).map.entries()].sort());

  it("not signed in", async () => {
    const a = seeded();
    const before = snapshotOf(a);
    expect(await syncOnce({ storage: a, fetch: account().serverFetch, token: () => null })).toEqual({ state: "signed-out" });
    expect(snapshotOf(a)).toBe(before);
  });

  it("a rejected or expired token", async () => {
    const a = seeded();
    const before = snapshotOf(a);
    expect(await syncOnce({ storage: a, fetch: account().serverFetch, token: () => "tok-someone-else" })).toEqual({ state: "signed-out" });
    expect(snapshotOf(a)).toBe(before);
  });

  it("no network", async () => {
    const a = seeded();
    const before = snapshotOf(a);
    const r = await sync(a, account(), { fetch: async () => { throw new TypeError("fetch failed"); } });
    expect(r).toEqual({ state: "offline" });
    expect(snapshotOf(a)).toBe(before);
  });

  it("the server is down", async () => {
    const a = seeded();
    const before = snapshotOf(a);
    const r = await sync(a, account(), { fetch: async () => new Response("oops", { status: 503 }) });
    expect(r.state).toBe("error");
    expect(snapshotOf(a)).toBe(before);
  });

  it("sync is not set up on the server", async () => {
    const a = seeded();
    expect(await sync(a, account(), { fetch: async () => new Response("{}", { status: 501 }) })).toEqual({ state: "unavailable" });
  });

  it("the stored cloud data is corrupt: it is refused, and local data is untouched", async () => {
    const a = seeded();
    const before = snapshotOf(a);
    const r = await sync(a, account(), { fetch: async () => Response.json({ snapshot: { v: 9, junk: true }, version: 3 }) });
    expect(r.state).toBe("error");
    expect(snapshotOf(a)).toBe(before);
  });

  it("a server that always answers 'conflict' gives up cleanly instead of looping forever", async () => {
    const a = seeded();
    const acc = account();
    const r = await sync(a, acc, { maxRounds: 3, fetch: async (url, init) => (init?.method === "PUT" ? new Response("{}", { status: 412 }) : acc.serverFetch(url, init)) });
    expect(r.state).toBe("error");
  });

  it("hostile data from the server is cleaned before it reaches this browser", async () => {
    const a = browser();
    loadWorkspace(a);
    const hostile = { v: 1, profile: null, removed: {}, resumes: [{ id: rid(5), name: "Evil\u0007", updatedAt: 5, draft: { resume: { contact: { fullName: "X\u0000Y", isAdmin: true } }, jd: "x".repeat(50_000) } }] };
    const r = await sync(a, account(), { fetch: async () => Response.json({ snapshot: hostile, version: 1 }) });
    expect(r.state).toBe("synced");
    const d = loadDraft(a, rid(5))!;
    expect(d.resume.contact.fullName).toBe("XY");
    expect(JSON.stringify(d)).not.toContain("isAdmin");
    expect(d.jd.length).toBeLessThanOrEqual(12_000);
  });
});
