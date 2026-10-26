import { describe, expect, it } from "vitest";
import { emptyResume, parseDraft } from "@/lib/draft-model";
import { loadDraft, saveDraft } from "@/lib/workspace";
import type { StorageLike } from "@/lib/workspace";

const memory = (): StorageLike => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

/** An unfinished resume: a name and a job, but no email yet. Real people fill things in in any order. */
const unfinished = () => {
  const r = emptyResume();
  r.contact.fullName = "Asha Rao";
  r.contact.email = "asha@";
  r.experience = [{ id: "e1", company: "Acme", role: "Engineer", location: "", start: "2020", end: "2021", bullets: ["Built dashboards", "Fixed bugs"] }];
  r.skills = [{ label: "Tools", items: ["React", "Git"] }];
  return r;
};

describe("REGRESSION: unfinished work survives a reload (it used to be replaced by an empty resume)", () => {
  it("parseDraft keeps a resume that has no valid email yet", () => {
    const d = parseDraft({ resume: unfinished(), jd: "job", template: {}, review: null });
    expect(d.resume.contact.fullName).toBe("Asha Rao");
    expect(d.resume.contact.email).toBe("asha@");
    expect(d.resume.experience[0].bullets).toEqual(["Built dashboards", "Fixed bugs"]);
    expect(d.resume.skills[0].items).toEqual(["React", "Git"]);
    expect(d.jd).toBe("job");
  });

  it("saving then loading from storage returns the same unfinished resume", () => {
    const s = memory();
    saveDraft(s, "r-abcd1234", { resume: unfinished(), jd: "", template: parseDraft({}).template, review: null });
    const back = loadDraft(s, "r-abcd1234")!;
    expect(back.resume).toEqual(unfinished());
  });

  it("still sanitises: wrong types, oversized text, control characters and unknown fields do not get through", () => {
    const d = parseDraft({ resume: { ...unfinished(), isAdmin: true, contact: { fullName: "A\u0000".repeat(200), email: 5, links: "x" }, certifications: Array.from({ length: 30 }, (_, i) => `c${i}`) }, jd: "x".repeat(50_000) });
    expect(d.resume.contact.fullName.length).toBeLessThanOrEqual(80);
    expect(d.resume.contact.fullName).not.toContain("\u0000");
    expect(d.resume.contact.email).toBe("");
    expect(d.resume.contact.links).toEqual([]);
    expect(d.resume.certifications).toHaveLength(10);
    expect("isAdmin" in d.resume).toBe(false);
    expect(d.jd.length).toBeLessThanOrEqual(12_000);
  });

  it("garbage in gives an empty resume, never a crash", () => {
    for (const bad of [null, undefined, 5, "x", [], { resume: 3 }]) expect(() => parseDraft(bad)).not.toThrow();
    expect(parseDraft(null).resume).toEqual(parseDraft(null).resume);
  });
});
