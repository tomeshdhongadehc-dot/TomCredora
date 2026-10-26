import { describe, expect, it } from "vitest";
import { cleanResume, validateResume } from "@/lib/clean";
import { emptyResume } from "@/lib/draft";
import { SAMPLE_RESUME } from "./fixtures";

describe("cleanResume", () => {
  it("drops empty bullets, skill items, blank roles and blank links", () => {
    const r = emptyResume();
    r.skills = [{ label: " Lang ", items: [" TS", "", " "] }, { label: "Empty", items: ["", " "] }];
    r.experience = [
      { id: "a", company: "", role: "", location: "", start: "", end: "", bullets: [""] },
      { id: "b", company: "Acme", role: "Dev", location: "", start: "", end: "", bullets: ["did x", "", "  "] },
    ];
    r.contact.links = [{ label: "Link", url: "" }];
    const c = cleanResume(r);
    expect(c.skills).toEqual([{ label: "Lang", items: ["TS"] }]);
    expect(c.experience).toHaveLength(1);
    expect(c.experience[0].bullets).toEqual(["did x"]);
    expect(c.contact.links).toEqual([]);
  });
});

describe("validateResume", () => {
  it("returns friendly, field-keyed errors", () => {
    const v = validateResume(emptyResume());
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors["contact.fullName"]).toBe("Add your full name");
      expect(v.errors["contact.email"]).toBe("Enter a valid email address");
    }
  });
  it("accepts a complete resume", () => {
    expect(validateResume(SAMPLE_RESUME).ok).toBe(true);
  });
  it("rejects a non-http link", () => {
    const r = structuredClone(SAMPLE_RESUME);
    r.contact.links = [{ label: "x", url: "javascript:alert(1)" }];
    expect(validateResume(r).ok).toBe(false);
  });
});
