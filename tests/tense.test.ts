import { describe, expect, it } from "vitest";
import { isFinishedRole, pastTenseLead, polishBullet, toPast } from "@/lib/ai/tense";
import { tailorResume } from "@/lib/ai/tailor";
import type { TailorOutput } from "@/lib/ai/prompts/v2/tailor";
import type { LLMProvider } from "@/lib/ai/provider";
import { resumeSchema } from "@/lib/schema";
import { SAMPLE_JD } from "./fixtures";

describe("toPast", () => {
  it("handles regular, e-ending, doubling and irregular verbs", () => {
    expect(toPast("migrate")).toBe("migrated");
    expect(toPast("automate")).toBe("automated");
    expect(toPast("deploy")).toBe("deployed"); // vowel + y: no -ied
    expect(toPast("apply")).toBe("applied");
    expect(toPast("ship")).toBe("shipped");
    expect(toPast("plan")).toBe("planned");
    expect(toPast("lead")).toBe("led");
    expect(toPast("build")).toBe("built");
    expect(toPast("rebuild")).toBe("rebuilt");
  });
  it("returns null for unknown words so nothing is rewritten by guesswork", () => {
    expect(toPast("synergize")).toBeNull();
    expect(toPast("Kubernetes")).toBeNull();
    expect(toPast("built")).toBeNull();
  });
});

describe("pastTenseLead", () => {
  it("converts only the lead verb and keeps the rest and the casing", () => {
    expect(pastTenseLead("Automate deployment pipelines using CI/CD on AWS")).toBe("Automated deployment pipelines using CI/CD on AWS");
    expect(pastTenseLead("Migrate 40 legacy components to TypeScript")).toBe("Migrated 40 legacy components to TypeScript");
    expect(pastTenseLead("Enhance page performance by 38%")).toBe("Enhanced page performance by 38%");
  });
  it("leaves already-past, unknown and non-verb leads alone", () => {
    for (const b of ["Rebuilt checkout in React", "Led a team of 4", "Kubernetes migration for 3 clusters", "2x faster builds", "Managed 5 reports"]) expect(pastTenseLead(b)).toBe(b);
  });
  it("does not mangle noun phrases that start with an ambiguous verb word", () => {
    expect(pastTenseLead("Lead developer on the payments platform")).toBe("Lead developer on the payments platform");
    expect(pastTenseLead("Test coverage grew to 90%")).toBe("Test coverage grew to 90%");
    expect(pastTenseLead("Lead a team of 4 engineers")).toBe("Led a team of 4 engineers");
    expect(pastTenseLead("Design the new onboarding flow")).toBe("Designed the new onboarding flow");
  });
});

describe("isFinishedRole / polishBullet", () => {
  it("recognises current vs finished roles", () => {
    for (const e of ["Present", "present", "Current", "Now", "Ongoing", ""]) expect(isFinishedRole(e), e).toBe(false);
    for (const e of ["Dec 2021", "2019", "03/2020"]) expect(isFinishedRole(e), e).toBe(true);
  });
  it("strips trailing periods; fixes tense only for finished roles", () => {
    expect(polishBullet("Automate releases on AWS.", true)).toBe("Automated releases on AWS");
    expect(polishBullet("Automate releases on AWS.", false)).toBe("Automate releases on AWS");
    expect(polishBullet("  Cut costs 20%.  ", false)).toBe("Cut costs 20%");
  });
});

describe("pipeline applies the polish end to end", () => {
  const profile = resumeSchema.parse({
    contact: { fullName: "T U", email: "t@u.co" },
    skills: [{ label: "S", items: ["React", "AWS"] }],
    experience: [
      { id: "cur", company: "Now Inc", role: "Dev", start: "Jan 2022", end: "Present", bullets: ["Built React app used by 5,000 users"] },
      { id: "old", company: "Then Ltd", role: "Dev", start: "Jan 2019", end: "Dec 2021", bullets: ["Automated releases on AWS in 5 days"] },
    ],
  });
  const output: TailorOutput = {
    summary: "Engineer building React apps.",
    skills: [{ label: "S", items: ["React", "AWS"] }],
    experience: [
      { id: "cur", bullets: [{ text: "Mentor engineers while building React app used by 5,000 users.", from: 0, needs_metric: false, keywords_used: [] }] },
      { id: "old", bullets: [{ text: "Automate releases on AWS, cutting cycle to 5 days.", from: 0, needs_metric: false, keywords_used: [] }] },
    ],
    questions: [],
  };
  const provider: LLMProvider = { name: "m", generate: async <T,>() => ({ data: output as unknown as T, usage: { inputTokens: 1, outputTokens: 1 }, model: "m" }) };

  it("finished role gets past tense; current role keeps present; no trailing periods", async () => {
    const r = await tailorResume({ provider, profile, jd: SAMPLE_JD });
    const byId = Object.fromEntries(r.resume.experience.map((e) => [e.id, e.bullets[0]]));
    expect(byId.old).toBe("Automated releases on AWS, cutting cycle to 5 days");
    expect(byId.cur).toBe("Mentor engineers while building React app used by 5,000 users");
  });
});
