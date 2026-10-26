import { describe, expect, it } from "vitest";
import { emptyDraft, hasContent, parseDraft } from "@/lib/draft-model";
import {
  INDEX_KEY, LEGACY_KEY, MAX_RESUMES, addResume, cleanResumeName, cloneDraft, dataKey, exportBundle, isResumeId,
  loadDraft, loadWorkspace, parseImport, parseIndex, removeResume, renameResume, saveDraft, saveIndex, uniqueName,
  type StorageLike, type WorkspaceIndex,
} from "@/lib/workspace";
import { SAMPLE_RESUME } from "@/lib/sample";
import { presetById } from "@/lib/templates";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const withSample = () => ({ ...emptyDraft(), resume: structuredClone(SAMPLE_RESUME), jd: "Senior engineer role", template: presetById("curve").config });
const idx = (...names: string[]): WorkspaceIndex => ({
  activeId: "r-aaaa0001",
  items: names.map((n, i) => ({ id: `r-aaaa${String(i + 1).padStart(4, "0")}`, name: n, updatedAt: i })),
});

describe("first run and migration", () => {
  it("a first-time visitor gets one empty resume and it is saved", () => {
    const s = memoryStorage();
    const { index, draft } = loadWorkspace(s);
    expect(index.items).toHaveLength(1);
    expect(index.items[0].name).toBe("Untitled resume");
    expect(hasContent(draft.resume)).toBe(false);
    expect(s.data.has(INDEX_KEY)).toBe(true);
    expect(s.data.has(dataKey(index.activeId))).toBe(true);
  });

  it("someone upgrading from the single-draft version keeps their draft, moved into 'My resume'", () => {
    const old = withSample();
    const s = memoryStorage({ [LEGACY_KEY]: JSON.stringify(old) });
    const { index, draft } = loadWorkspace(s);
    expect(index.items[0].name).toBe("My resume");
    expect(draft.resume.contact.fullName).toBe("Asha Rao");
    expect(draft.jd).toBe("Senior engineer role");
    expect(draft.template.id).toBe("curve");
    expect(s.data.get(LEGACY_KEY)).toBeDefined(); // left in place as a backup
  });

  it("loading is idempotent: a second load returns the same resume and does not migrate again", () => {
    const s = memoryStorage({ [LEGACY_KEY]: JSON.stringify(withSample()) });
    const first = loadWorkspace(s);
    const second = loadWorkspace(s);
    expect(second.index).toEqual(first.index);
    expect(second.index.items).toHaveLength(1);
  });

  it("returns the saved active resume on later visits", () => {
    const s = memoryStorage();
    const { index } = loadWorkspace(s);
    saveDraft(s, index.activeId, withSample());
    expect(loadWorkspace(s).draft.resume.contact.fullName).toBe("Asha Rao");
  });

  it("survives corrupted storage without throwing", () => {
    const s = memoryStorage({ [INDEX_KEY]: "{not json", [LEGACY_KEY]: "also broken" });
    const { index, draft } = loadWorkspace(s);
    expect(index.items).toHaveLength(1);
    expect(hasContent(draft.resume)).toBe(false);
  });

  it("an index that points at a missing data key still opens (that resume starts empty)", () => {
    const i = idx("A");
    const s = memoryStorage({ [INDEX_KEY]: JSON.stringify(i) });
    const { index, draft } = loadWorkspace(s);
    expect(index.activeId).toBe("r-aaaa0001");
    expect(hasContent(draft.resume)).toBe(false);
  });
});

describe("parseIndex (stored data is untrusted)", () => {
  it("drops malformed, duplicate and unnamed entries and repairs a bad activeId", () => {
    const out = parseIndex({
      activeId: "r-nope0000",
      items: [{ id: "r-good0001", name: "Good", updatedAt: 5 }, { id: "r-good0001", name: "Dupe" }, { id: "../../x", name: "Evil" }, { id: "r-blank001", name: "   " }, { id: 7, name: "N" }, null, "str"],
    })!;
    expect(out.items.map((i) => i.id)).toEqual(["r-good0001"]);
    expect(out.activeId).toBe("r-good0001");
  });
  it("returns null when nothing usable remains", () => {
    expect(parseIndex(null)).toBeNull();
    expect(parseIndex({ items: [] })).toBeNull();
    expect(parseIndex({ items: "x" })).toBeNull();
  });
  it("caps the number of resumes", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `r-id${String(i).padStart(5, "0")}`, name: `R${i}` }));
    expect(parseIndex({ items: many })!.items).toHaveLength(MAX_RESUMES);
  });
  it("id and name validation", () => {
    expect(isResumeId("r-abcd1234")).toBe(true);
    for (const bad of ["abcd1234", "r-", "r-ABCD1234", "r-abc/123", "r-" + "a".repeat(13), 5, null]) expect(isResumeId(bad), String(bad)).toBe(false);
    expect(cleanResumeName("  My \n resume\t\u0007 ")).toBe("My resume");
    expect(cleanResumeName("x".repeat(100))).toHaveLength(60);
  });
});

describe("managing resumes", () => {
  it("addResume activates the new resume, with a unique name", () => {
    const a = addResume(idx("Resume"), "Resume")!;
    expect(a.index.items.map((i) => i.name)).toEqual(["Resume", "Resume 2"]);
    expect(a.index.activeId).toBe(a.id);
    expect(addResume(a.index, "Resume")!.index.items.at(-1)!.name).toBe("Resume 3");
  });
  it("addResume refuses past the limit", () => {
    let i = idx("A");
    for (let n = 0; n < MAX_RESUMES - 1; n++) i = addResume(i, `R${n}`)!.index;
    expect(i.items).toHaveLength(MAX_RESUMES);
    expect(addResume(i, "one more")).toBeNull();
  });
  it("renameResume keeps names unique and ignores empty names", () => {
    const i = idx("Alpha", "Beta");
    expect(renameResume(i, "r-aaaa0002", "Alpha").items[1].name).toBe("Alpha 2");
    expect(renameResume(i, "r-aaaa0002", "   ")).toBe(i);
    expect(renameResume(i, "r-aaaa0002", "Gamma").items[1].name).toBe("Gamma");
    expect(renameResume(i, "r-aaaa0001", "Alpha").items[0].name).toBe("Alpha"); // renaming to its own name is not a clash
  });
  it("removeResume: never removes the last one; the active one hands over to its neighbour", () => {
    expect(removeResume(idx("Only"), "r-aaaa0001")).toBeNull();
    const i = idx("A", "B", "C");
    expect(removeResume(i, "r-nope0000")).toBeNull();
    const afterActive = removeResume({ ...i, activeId: "r-aaaa0002" }, "r-aaaa0002")!;
    expect(afterActive.items.map((x) => x.name)).toEqual(["A", "C"]);
    expect(afterActive.activeId).toBe("r-aaaa0003");
    const afterLast = removeResume({ ...i, activeId: "r-aaaa0003" }, "r-aaaa0003")!;
    expect(afterLast.activeId).toBe("r-aaaa0002");
    expect(removeResume(i, "r-aaaa0003")!.activeId).toBe("r-aaaa0001"); // removing another keeps the active one
  });
  it("uniqueName", () => {
    expect(uniqueName(idx("A").items, "B")).toBe("B");
    expect(uniqueName(idx("A").items, "a")).toBe("a 2"); // case-insensitive clash
    expect(uniqueName([], "   ")).toBe("Untitled resume");
  });
});

describe("storage failures do not throw", () => {
  it("a store whose writes throw still lets the app load and edit in memory", () => {
    const broken: StorageLike = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
    expect(() => loadWorkspace(broken)).not.toThrow();
    expect(saveDraft(broken, "r-aaaa0001", emptyDraft())).toBe(false);
    expect(saveIndex(broken, idx("A"))).toBe(false);
    expect(loadDraft(broken, "r-aaaa0001")).toBeNull();
  });
});

describe("import / export", () => {
  it("round-trips a resume exactly (what you export is what you import)", () => {
    const d = withSample();
    const r = parseImport(exportBundle("Board pack", d));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.name).toBe("Board pack");
      expect(r.draft.resume).toEqual(d.resume);
      expect(r.draft.template).toEqual(d.template);
      expect(r.draft.jd).toBe(d.jd);
      expect(r.draft.review).toBeNull();
    }
  });
  it("accepts the older 'Backup (.json)' shape and a bare resume object", () => {
    const d = withSample();
    expect(parseImport(JSON.stringify({ resume: d.resume, template: d.template })).ok).toBe(true);
    const bare = parseImport(JSON.stringify(d.resume), "from-file");
    expect(bare.ok && bare.name).toBe("from-file");
  });
  it("rejects invalid input with a helpful message instead of importing an empty resume", () => {
    const err = (t: string) => { const r = parseImport(t); return r.ok ? "OK" : r.error; };
    expect(err("nope")).toMatch(/not valid JSON/);
    expect(err("[]")).toMatch(/not a resume/);
    expect(err("null")).toMatch(/not a resume/);
    expect(err("{}")).toMatch(/No valid resume/);
    expect(err(JSON.stringify({ resume: { contact: { fullName: "A", email: "not-an-email" } } }))).toMatch(/No valid resume/);
    expect(err("x".repeat(1_000_001))).toMatch(/too large/);
  });
  it("strips pending AI confirmations and ignores hostile extra fields", () => {
    const d = withSample();
    const r = parseImport(JSON.stringify({ format: "tomcredora-resume", resume: { ...d.resume, isAdmin: true }, review: { ledger: [], questions: [], resolved: [] } }));
    // unknown fields are dropped, never kept: a hostile extra field cannot ride along into storage
    expect(r.ok && "isAdmin" in r.draft.resume).toBe(false);
    expect(r.ok && r.draft.review).toBeNull();
    const ok = parseImport(JSON.stringify({ resume: d.resume, template: { evil: true }, review: { ledger: [], questions: [], resolved: [] } }));
    expect(ok.ok && ok.draft.review).toBeNull();
    expect(ok.ok && ok.draft.template.id).toBe("classic"); // a tampered template falls back to the default
  });
});

describe("cloneDraft", () => {
  it("gives every item a fresh id, drops the review, and leaves the original untouched", () => {
    const d = { ...withSample(), review: { ledger: [], questions: [], resolved: [] } };
    const before = JSON.stringify(d);
    const c = cloneDraft(d);
    expect(JSON.stringify(d)).toBe(before);
    expect(c.review).toBeNull();
    const oldIds = new Set([...d.resume.experience, ...d.resume.education].map((x) => x.id));
    for (const x of [...c.resume.experience, ...c.resume.education]) expect(oldIds.has(x.id)).toBe(false);
    expect(c.resume.experience.map((e) => e.company)).toEqual(d.resume.experience.map((e) => e.company));
  });
});

describe("parseDraft", () => {
  it("falls back part by part", () => {
    const d = parseDraft({ resume: { nonsense: true }, jd: 42, template: "x", review: "y" });
    expect(hasContent(d.resume)).toBe(false);
    expect(d.jd).toBe("");
    expect(d.template.id).toBe("classic");
    expect(d.review).toBeNull();
  });
  it("caps the job description length", () => {
    expect(parseDraft({ jd: "x".repeat(50_000) }).jd).toHaveLength(12_000);
  });
});
