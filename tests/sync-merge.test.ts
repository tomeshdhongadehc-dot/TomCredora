import { describe, expect, it } from "vitest";
import { emptyDraft } from "@/lib/draft-model";
import { emptyProfile } from "@/lib/profile";
import { MAX_REMOVED, emptySnapshot, mergeSnapshots, normalize, sameSnapshot, sanitizeSnapshot, snapshotSchema, type Snapshot, type SyncResume } from "@/lib/sync/model";
import { MAX_RESUMES } from "@/lib/workspace";

const rid = (n: number) => `r-${String(n).padStart(8, "0")}`;
const resume = (n: number, updatedAt: number, label = "x"): SyncResume => {
  const draft = emptyDraft();
  draft.resume.contact.fullName = `${label}-${n}-${updatedAt}`;
  return { id: rid(n), name: `Resume ${n}`, updatedAt, draft };
};
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({ ...emptySnapshot(), ...over });
const prof = (updatedAt: number, name: string) => {
  const p = emptyProfile();
  p.resume.contact.fullName = name;
  return { updatedAt, data: p };
};
const ids = (s: Snapshot) => s.resumes.map((r) => r.id).sort();
const find = (s: Snapshot, n: number) => s.resumes.find((r) => r.id === rid(n));

describe("merging account data from two devices", () => {
  it("keeps a resume that exists on only one side", () => {
    const m = mergeSnapshots(snap({ resumes: [resume(1, 10)] }), snap({ resumes: [resume(2, 20)] }));
    expect(ids(m)).toEqual([rid(1), rid(2)]);
  });

  it("when both have the same resume, the most recently edited copy wins", () => {
    const m = mergeSnapshots(snap({ resumes: [resume(1, 10, "old")] }), snap({ resumes: [resume(1, 50, "new")] }));
    expect(find(m, 1)!.draft.resume.contact.fullName).toBe("new-1-50");
  });

  it("a delete beats an older copy, so a deleted resume does not come back from another device", () => {
    const m = mergeSnapshots(snap({ resumes: [resume(1, 10)] }), snap({ removed: { [rid(1)]: 20 } }));
    expect(m.resumes).toEqual([]);
    expect(m.removed[rid(1)]).toBe(20);
  });

  it("an edit made AFTER the delete brings the resume back", () => {
    const m = mergeSnapshots(snap({ resumes: [resume(1, 30)] }), snap({ removed: { [rid(1)]: 20 } }));
    expect(ids(m)).toEqual([rid(1)]);
    expect(m.removed[rid(1)]).toBeUndefined();
  });

  it("the profile is the more recently changed one, and one side being empty never erases the other", () => {
    expect(mergeSnapshots(snap({ profile: prof(10, "old") }), snap({ profile: prof(50, "new") })).profile!.data.resume.contact.fullName).toBe("new");
    expect(mergeSnapshots(snap({ profile: prof(10, "only") }), snap()).profile!.data.resume.contact.fullName).toBe("only");
    expect(mergeSnapshots(snap(), snap({ profile: prof(10, "only") })).profile!.data.resume.contact.fullName).toBe("only");
    expect(mergeSnapshots(snap(), snap()).profile).toBeNull();
  });

  it("a fresh device (empty) merged with the account gives exactly the account", () => {
    const account = snap({ profile: prof(5, "me"), resumes: [resume(1, 10), resume(2, 20)], removed: { [rid(3)]: 7 } });
    expect(sameSnapshot(mergeSnapshots(snap(), account), account)).toBe(true);
  });

  it("never exceeds the resume limit; the oldest are dropped and stay deleted", () => {
    const many = Array.from({ length: MAX_RESUMES + 5 }, (_, i) => resume(i, 100 + i));
    const m = mergeSnapshots(snap({ resumes: many.slice(0, 15) }), snap({ resumes: many.slice(10) }));
    expect(m.resumes).toHaveLength(MAX_RESUMES);
    const dropped = many.filter((r) => !find(m, Number(r.id.slice(2))));
    expect(dropped).toHaveLength(5);
    for (const d of dropped) expect(m.removed[d.id]).toBeGreaterThanOrEqual(d.updatedAt);
    expect(Object.keys(m.removed).length).toBeLessThanOrEqual(MAX_REMOVED);
  });

  it("does not mutate its inputs", () => {
    const a = snap({ resumes: [resume(1, 10)], removed: { [rid(2)]: 5 } });
    const b = snap({ resumes: [resume(1, 20)], removed: { [rid(1)]: 15 } });
    const [ja, jb] = [JSON.stringify(a), JSON.stringify(b)];
    mergeSnapshots(a, b);
    expect([JSON.stringify(a), JSON.stringify(b)]).toEqual([ja, jb]);
  });
});

// A small seeded generator so a failure is reproducible.
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
function random(next: () => number): Snapshot {
  const pick = (n: number) => Math.floor(next() * n);
  const resumes: SyncResume[] = [];
  const removed: Record<string, number> = {};
  for (let i = 0; i < 6; i++) {
    const roll = next();
    if (roll < 0.5) resumes.push(resume(i, 1 + pick(40), `d${pick(3)}`));
    else if (roll < 0.7) removed[rid(i)] = 1 + pick(40);
  }
  return snap({ profile: next() < 0.6 ? prof(1 + pick(40), `p${pick(4)}`) : null, resumes, removed });
}

describe("merge laws: devices that merge in any order end up identical", () => {
  const runs = 300;
  it(`commutative: merge(a, b) equals merge(b, a), over ${runs} random cases`, () => {
    const next = rng(1);
    for (let i = 0; i < runs; i++) {
      const [a, b] = [random(next), random(next)];
      expect(sameSnapshot(mergeSnapshots(a, b), mergeSnapshots(b, a)), `case ${i}`).toBe(true);
    }
  });

  it(`idempotent: merging again changes nothing, over ${runs} random cases`, () => {
    const next = rng(2);
    for (let i = 0; i < runs; i++) {
      const [a, b] = [random(next), random(next)];
      const m = mergeSnapshots(a, b);
      expect(sameSnapshot(mergeSnapshots(m, b), m), `case ${i} (b)`).toBe(true);
      expect(sameSnapshot(mergeSnapshots(m, a), m), `case ${i} (a)`).toBe(true);
      expect(sameSnapshot(mergeSnapshots(m, m), m), `case ${i} (m)`).toBe(true);
    }
  });

  it(`associative: grouping does not matter, over ${runs} random cases`, () => {
    const next = rng(3);
    for (let i = 0; i < runs; i++) {
      const [a, b, c] = [random(next), random(next), random(next)];
      expect(sameSnapshot(mergeSnapshots(mergeSnapshots(a, b), c), mergeSnapshots(a, mergeSnapshots(b, c))), `case ${i}`).toBe(true);
    }
  });

  it(`no lost edit: the newest copy of every resume survives unless a later delete says otherwise, over ${runs} random cases`, () => {
    const next = rng(4);
    for (let i = 0; i < runs; i++) {
      const [a, b] = [random(next), random(next)];
      const m = mergeSnapshots(a, b);
      for (const r of [...a.resumes, ...b.resumes]) {
        const newest = Math.max(...[...a.resumes, ...b.resumes].filter((x) => x.id === r.id).map((x) => x.updatedAt));
        const deletedAt = Math.max(a.removed[r.id] ?? -1, b.removed[r.id] ?? -1);
        const got = m.resumes.find((x) => x.id === r.id);
        if (deletedAt < newest) expect(got?.updatedAt, `case ${i} ${r.id}`).toBe(newest);
        else expect(got, `case ${i} ${r.id} should be deleted`).toBeUndefined();
      }
    }
  });
});

describe("what the server accepts", () => {
  const ok = { v: 1, profile: null, resumes: [], removed: {} };
  it("accepts a well-formed snapshot", () => {
    expect(snapshotSchema.safeParse(ok).success).toBe(true);
    expect(snapshotSchema.safeParse({ ...ok, profile: { updatedAt: 5, data: { anything: 1 } }, resumes: [{ id: rid(1), name: "A", updatedAt: 5, draft: {} }] }).success).toBe(true);
  });

  it("rejects bad shapes, bad ids, huge timestamps, extra fields and too many items", () => {
    const bad = (o: unknown) => snapshotSchema.safeParse(o).success;
    expect(bad({ ...ok, v: 2 })).toBe(false);
    expect(bad({ ...ok, extra: 1 })).toBe(false);
    expect(bad({ ...ok, resumes: [{ id: "../etc", name: "A", updatedAt: 5, draft: {} }] })).toBe(false);
    expect(bad({ ...ok, resumes: [{ id: rid(1), name: "A", updatedAt: 9e15, draft: {} }] })).toBe(false);
    expect(bad({ ...ok, resumes: [{ id: rid(1), name: "A", updatedAt: -1, draft: {} }] })).toBe(false);
    expect(bad({ ...ok, resumes: Array.from({ length: MAX_RESUMES + 1 }, (_, i) => ({ id: rid(i), name: "A", updatedAt: 1, draft: {} })) })).toBe(false);
    expect(bad({ ...ok, removed: Object.fromEntries(Array.from({ length: MAX_REMOVED + 1 }, (_, i) => [rid(i), 1])) })).toBe(false);
    expect(bad({ ...ok, removed: { nope: 1 } })).toBe(false);
  });

  it("sanitising cleans contents: unfinished resumes are kept, hostile fields and control characters are not", () => {
    const parsed = snapshotSchema.parse({
      v: 1,
      profile: { updatedAt: 9, data: { focus: "software", resume: { contact: { fullName: "A\u0000B", email: "not-yet" }, isAdmin: true } } },
      resumes: [
        { id: rid(1), name: "  Mine \u0007 ", updatedAt: 5, draft: { resume: { contact: { fullName: "Asha", email: "asha@" } }, jd: "job", evil: 1 } },
        { id: rid(1), name: "older duplicate", updatedAt: 1, draft: {} },
      ],
      removed: {},
    });
    const s = sanitizeSnapshot(parsed);
    expect(s.resumes).toHaveLength(1); // duplicate id collapsed to the newer one
    expect(s.resumes[0].name).toBe("Mine");
    expect(s.resumes[0].draft.resume.contact).toMatchObject({ fullName: "Asha", email: "asha@" });
    expect(s.resumes[0].draft.jd).toBe("job");
    expect(s.profile!.data.resume.contact.fullName).toBe("AB");
    expect("isAdmin" in s.profile!.data.resume).toBe(false);
    expect(JSON.stringify(s)).not.toContain("evil");
  });

  it("normalize is stable", () => {
    const a = snap({ resumes: [resume(2, 1), resume(1, 1)], removed: { [rid(9)]: 1, [rid(3)]: 2 } });
    const n = normalize(a);
    expect(n.resumes.map((r) => r.id)).toEqual([rid(1), rid(2)]);
    expect(Object.keys(n.removed)).toEqual([rid(3), rid(9)]);
    expect(JSON.stringify(normalize(n))).toBe(JSON.stringify(n));
  });
});
