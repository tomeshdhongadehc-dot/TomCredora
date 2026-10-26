import { describe, expect, it } from "vitest";
import { DEGREES, FAMILIES, MONTHS, familyById, formatDate, parseDate, yearsFrom } from "@/lib/catalog";
import { emptyResume } from "@/lib/draft-model";
import { completeness, emptyProfile, loadProfile, looseResume, parseProfile, profileFromResume, profileHasContent, saveProfile, seedFromProfile, PROFILE_KEY } from "@/lib/profile";
import { SAMPLE_RESUME } from "@/lib/sample";
import { resumeSchema } from "@/lib/schema";
import type { StorageLike } from "@/lib/workspace";

const memory = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

describe("catalog: the quick-pick content is safe to put into a resume", () => {
  it("has unique families, each with titles, skills, duties and certifications", () => {
    expect(new Set(FAMILIES.map((f) => f.id)).size).toBe(FAMILIES.length);
    for (const f of FAMILIES) {
      expect(f.titles.length, f.id).toBeGreaterThanOrEqual(5);
      expect(f.skills.length, f.id).toBeGreaterThanOrEqual(2);
      expect(f.duties.length, f.id).toBeGreaterThanOrEqual(5);
      expect(f.certs.length, f.id).toBeGreaterThanOrEqual(3);
      expect(familyById(f.id)).toBe(f);
    }
    expect(familyById("nope")).toBeUndefined();
  });

  it("every skill, duty and certification fits the resume schema limits, with no duplicates", () => {
    for (const f of FAMILIES) {
      expect(f.skills.length, `${f.id} groups`).toBeLessThanOrEqual(8);
      for (const g of f.skills) {
        expect(g.label.length).toBeLessThanOrEqual(40);
        expect(g.items.length, `${f.id}/${g.label}`).toBeLessThanOrEqual(25);
        expect(new Set(g.items).size, `${f.id}/${g.label} duplicates`).toBe(g.items.length);
        for (const s of g.items) expect(s.length, s).toBeLessThanOrEqual(40);
      }
      for (const d of f.duties) expect(d.length, d).toBeLessThanOrEqual(300);
      for (const c of f.certs) expect(c.length, c).toBeLessThanOrEqual(120);
      expect(new Set(f.duties).size).toBe(f.duties.length);
    }
  });

  it("HONESTY: no duty suggestion contains a number or a result, so the app never suggests an invented outcome", () => {
    for (const f of FAMILIES) for (const d of f.duties) expect(d, `${f.id}: ${d}`).not.toMatch(/\d|%|\$|₹/);
  });

  it("a full set of chosen suggestions still validates as a resume", () => {
    const f = familyById("software")!;
    const r = {
      ...emptyResume(),
      contact: { fullName: "A B", headline: f.titles[0], email: "a@b.co", phone: "", location: "", links: [] },
      skills: f.skills.map((g) => ({ label: g.label, items: g.items })),
      experience: [{ id: "x", company: "Co", role: f.titles[0], location: "", start: "Jan 2020", end: "Present", bullets: f.duties.slice(0, 8) }],
      certifications: f.certs.slice(0, 10),
    };
    expect(resumeSchema.safeParse(r).success).toBe(true);
  });

  it("dates round-trip between the pickers and the stored text", () => {
    expect(formatDate("Jan", "2022")).toBe("Jan 2022");
    expect(formatDate("", "2022")).toBe("2022");
    expect(formatDate("", "")).toBe("");
    expect(parseDate("Jan 2022")).toEqual({ month: "Jan", year: "2022" });
    expect(parseDate("2019")).toEqual({ month: "", year: "2019" });
    expect(parseDate("September 2020")).toEqual({ month: "Sep", year: "2020" });
    // a month picked before the year must not be lost (picking month, then year, once dropped the month)
    expect(parseDate("Jan")).toEqual({ month: "Jan", year: "" });
    expect(parseDate(formatDate("Mar", ""))).toEqual({ month: "Mar", year: "" });
    expect(parseDate("Present")).toEqual({ month: "", year: "" });
    expect(parseDate("")).toEqual({ month: "", year: "" });
    for (const m of MONTHS) expect(parseDate(formatDate(m, "2001")).month).toBe(m);
    expect(yearsFrom(2026, 3)).toEqual(["2026", "2025", "2024", "2023"]);
    expect(DEGREES.length).toBeGreaterThan(8);
  });
});

describe("profile: loaded leniently, validated when used", () => {
  it("keeps an unfinished profile (no email yet, half-typed link) instead of throwing it away", () => {
    const r = looseResume({ contact: { fullName: "Asha", email: "not-an-email", links: [{ label: "GitHub", url: "htt" }] } });
    expect(r.contact.fullName).toBe("Asha");
    expect(r.contact.email).toBe("not-an-email");
    expect(r.contact.links).toEqual([{ label: "GitHub", url: "htt" }]);
    expect(resumeSchema.safeParse(r).success).toBe(false); // ...but it cannot be sent to the AI until fixed
  });

  it("survives garbage: wrong types, huge strings, control characters, too many items", () => {
    expect(parseProfile(null)).toEqual(emptyProfile());
    expect(parseProfile("x")).toEqual(emptyProfile());
    expect(parseProfile({ resume: { contact: 5, skills: "no", experience: [null, 3, "a"] } }).resume.experience).toHaveLength(3);
    const p = parseProfile({ focus: "x".repeat(500), resume: { contact: { fullName: "A\u0000B".repeat(100) }, certifications: Array.from({ length: 50 }, (_, i) => `c${i}`), experience: Array.from({ length: 40 }, () => ({})) } });
    expect(p.focus.length).toBeLessThanOrEqual(30);
    expect(p.resume.contact.fullName.length).toBeLessThanOrEqual(80);
    expect(p.resume.contact.fullName).not.toContain("\u0000");
    expect(p.resume.certifications).toHaveLength(10);
    expect(p.resume.experience).toHaveLength(12);
    expect(new Set(p.resume.experience.map((e) => e.id)).size).toBe(12);
  });

  it("saves and loads, and a corrupt or missing entry gives null instead of an error", () => {
    const s = memory();
    expect(loadProfile(s)).toBeNull();
    const p = profileFromResume(SAMPLE_RESUME, "software");
    saveProfile(s, p);
    expect(loadProfile(s)).toEqual(p);
    s.map.set(PROFILE_KEY, "{not json");
    expect(loadProfile(s)).toBeNull();
    const broken: StorageLike = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => {} };
    expect(loadProfile(broken)).toBeNull();
    expect(() => saveProfile(broken, p)).not.toThrow();
  });

  it("profileHasContent ignores a profile that only has a chosen field", () => {
    expect(profileHasContent(null)).toBe(false);
    expect(profileHasContent({ ...emptyProfile(), focus: "software" })).toBe(false);
    expect(profileHasContent(profileFromResume(SAMPLE_RESUME))).toBe(true);
  });
});

describe("seeding a resume from the profile", () => {
  const profile = profileFromResume({ ...SAMPLE_RESUME, summary: "will not be copied" }, "software");

  it("copies the details, leaves the summary for the AI, and gives everything fresh ids", () => {
    const r = seedFromProfile(profile);
    expect(r.contact).toEqual(profile.resume.contact);
    expect(r.experience.map((e) => e.company)).toEqual(profile.resume.experience.map((e) => e.company));
    expect(r.experience[0].bullets).toEqual(profile.resume.experience[0].bullets);
    expect(r.summary).toBe("");
    const ids = new Set(profile.resume.experience.map((e) => e.id));
    for (const e of r.experience) expect(ids.has(e.id)).toBe(false);
  });

  it("the profile is not changed by seeding, and editing the seeded copy does not touch it", () => {
    const before = JSON.stringify(profile);
    const r = seedFromProfile(profile);
    r.experience[0].bullets.push("changed in the resume");
    r.contact.fullName = "Someone else";
    expect(JSON.stringify(profile)).toBe(before);
  });

  it("the seeded result is a valid resume when the profile is complete", () => {
    expect(resumeSchema.safeParse(seedFromProfile(profile)).success).toBe(true);
  });

  it("profileFromResume drops the summary (the profile holds only what never changes)", () => {
    expect(profileFromResume({ ...SAMPLE_RESUME, summary: "x" }).resume.summary).toBe("");
  });
});

describe("profile strength", () => {
  it("is 0 when empty and 100 when everything is there", () => {
    expect(completeness(emptyProfile()).pct).toBe(0);
    const full = profileFromResume(SAMPLE_RESUME);
    full.resume.contact.links = [{ label: "LinkedIn", url: "https://www.linkedin.com/in/x" }];
    expect(completeness(full)).toEqual({ pct: 100, missing: [] });
  });

  it("names what to do next, in a sensible order, and rises as parts are added", () => {
    const p = emptyProfile();
    expect(completeness(p).missing[0]).toBe("Your name");
    p.resume.contact.fullName = "Asha";
    const a = completeness(p);
    p.resume.contact.email = "a@b.co";
    const b = completeness(p);
    expect(b.pct).toBeGreaterThan(a.pct);
    expect(b.missing[0]).toBe("Phone or city");
  });

  it("two things you did needs two bullets in one role", () => {
    const p = profileFromResume(SAMPLE_RESUME);
    p.resume.experience = [{ ...p.resume.experience[0], bullets: ["one"] }];
    expect(completeness(p).missing).toContain("2 things you did in it");
  });
});
