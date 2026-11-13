import { describe, expect, it } from "vitest";
import { emptyDraft, type Draft } from "@/lib/draft-model";
import { clearJob, countByStatus, deleteJob, listJobs, openJob, updateJob } from "@/lib/jobs";
import { SAMPLE_RESUME } from "@/lib/sample";
import { INDEX_KEY, dataKey, loadDraft, loadWorkspace, saveDraft, saveIndex, type StorageLike } from "@/lib/workspace";

const memory = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

const job = (over = {}) => ({ title: "Frontend Engineer", company: "Acme", url: "https://acme.example/jobs/1", status: "saved" as const, note: "", createdAt: 1000, appliedAt: null, fp: "x", ...over });

/** A browser with three resumes: a general one, and two made for jobs. */
function setup() {
  const s = memory();
  const { index } = loadWorkspace(s, 1);
  const general = index.items[0].id;
  const a = "r-aaaa1111";
  const b = "r-bbbb2222";
  saveIndex(s, { activeId: general, items: [...index.items, { id: a, name: "Frontend Engineer at Acme", updatedAt: 200 }, { id: b, name: "Analyst at Initech", updatedAt: 300 }] });
  saveDraft(s, general, { ...emptyDraft(), resume: SAMPLE_RESUME });
  saveDraft(s, a, { ...emptyDraft(), resume: SAMPLE_RESUME, job: job() });
  saveDraft(s, b, { ...emptyDraft(), resume: SAMPLE_RESUME, job: job({ title: "Analyst", company: "Initech", status: "applied", appliedAt: 5 }) });
  return { s, general, a, b };
}

describe("the saved applications", () => {
  it("lists only resumes made for a job, newest first", () => {
    const { s, a, b } = setup();
    const rows = listJobs(s);
    expect(rows.map((r) => r.id)).toEqual([b, a]);
    expect(rows[0]).toMatchObject({ name: "Analyst at Initech", hasResume: true });
    expect(rows[0].job.company).toBe("Initech");
  });
  it("is empty for a new browser, damaged storage, and a resume whose data is missing", () => {
    expect(listJobs(memory())).toEqual([]);
    const s = memory();
    s.setItem(INDEX_KEY, "{not json");
    expect(listJobs(s)).toEqual([]);
    const { s: t, a } = setup();
    t.removeItem(dataKey(a));
    expect(listJobs(t)).toHaveLength(1);
  });
  it("counts each stage", () => {
    const { s } = setup();
    expect(countByStatus(listJobs(s))).toEqual({ all: 2, saved: 1, applied: 1, interview: 0, offer: 0, rejected: 0 });
  });
  it("changing the stage saves it, stamps the first time it was applied, and bumps the resume", () => {
    const { s, a } = setup();
    expect(updateJob(s, a, { status: "applied" }, 9000)).toBe(true);
    const d = loadDraft(s, a)!;
    expect(d.job).toMatchObject({ status: "applied", appliedAt: 9000 });
    expect(updateJob(s, a, { status: "interview" }, 12000)).toBe(true);
    expect(loadDraft(s, a)!.job!.appliedAt).toBe(9000); // the date it was first applied is kept
    expect(listJobs(s)[0].id).toBe(a); // most recently touched first
  });
  it("edits notes, title and company, and refuses bad values", () => {
    const { s, a } = setup();
    updateJob(s, a, { note: "Call Priya on Monday", title: "Staff Engineer", company: "Acme Inc", url: "javascript:alert(1)" });
    const j = loadDraft(s, a)!.job!;
    expect(j).toMatchObject({ note: "Call Priya on Monday", title: "Staff Engineer", company: "Acme Inc", url: "" });
    updateJob(s, a, { status: "hacked" as never });
    expect(loadDraft(s, a)!.job!.status).toBe("saved");
    expect(updateJob(s, "r-zzzz9999", { note: "x" })).toBe(false);
  });
  it("leaves the resume itself untouched when a status changes", () => {
    const { s, a } = setup();
    const before = loadDraft(s, a)!.resume;
    updateJob(s, a, { status: "offer" });
    expect(loadDraft(s, a)!.resume).toEqual(before);
  });
  it("opening makes it the workspace's resume", () => {
    const { s, a } = setup();
    expect(openJob(s, a)).toBe(true);
    expect(loadWorkspace(s).index.activeId).toBe(a);
    expect(openJob(s, "r-nope0000")).toBe(false);
  });
  it("deleting removes the resume and records it, but never the last one", () => {
    const { s, a, b, general } = setup();
    expect(deleteJob(s, a)).toBe(true);
    expect(s.getItem(dataKey(a))).toBeNull();
    expect(listJobs(s).map((r) => r.id)).toEqual([b]);
    expect(deleteJob(s, b)).toBe(true);
    expect(deleteJob(s, general)).toBe(false); // the last one stays
    expect(s.getItem(dataKey(general))).not.toBeNull();
  });
  it("stop tracking keeps the resume", () => {
    const { s, a } = setup();
    expect(clearJob(s, a)).toBe(true);
    const d: Draft = loadDraft(s, a)!;
    expect(d.job).toBeNull();
    expect(d.resume.contact.fullName).toBe(SAMPLE_RESUME.contact.fullName);
    expect(listJobs(s).map((r) => r.id)).not.toContain(a);
  });
});
