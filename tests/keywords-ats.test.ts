import { describe, expect, it } from "vitest";
import { extractKeywords, keywordCoverage, stuffedTerms } from "@/lib/keywords";
import { scoreResume } from "@/lib/ats-score";
import { resumeSchema } from "@/lib/schema";
import { SAMPLE_JD, SAMPLE_RESUME } from "./fixtures";

describe("extractKeywords", () => {
  const kws = extractKeywords(SAMPLE_JD);
  const terms = kws.map((k) => k.term);
  it("finds the key technologies", () => {
    for (const t of ["react", "typescript", "next.js", "graphql", "aws", "docker"]) expect(terms).toContain(t);
  });
  it("is capped and excludes stopwords", () => {
    expect(kws.length).toBeLessThanOrEqual(25);
    expect(terms).not.toContain("the");
  });
  it("is deterministic", () => {
    expect(extractKeywords(SAMPLE_JD)).toEqual(kws);
  });
  it("handles empty input", () => {
    expect(extractKeywords("")).toEqual([]);
  });
});

describe("coverage + scoring", () => {
  const kws = extractKeywords(SAMPLE_JD);
  it("computes coverage locally", () => {
    const c = keywordCoverage(SAMPLE_RESUME, kws);
    expect(c.matched).toContain("react");
    expect(c.missing).toContain("graphql");
    expect(c.pct).toBeGreaterThan(0);
    expect(c.pct).toBeLessThan(100);
  });
  it("scores a good resume well and an empty one badly", () => {
    const good = scoreResume(SAMPLE_RESUME, kws);
    const empty = scoreResume(
      resumeSchema.parse({ contact: { fullName: "A", email: "a@b.co" } }),
      kws,
    );
    expect(good.score).toBeGreaterThan(empty.score);
    expect(good.checks.find((c) => c.id === "dates")?.pass).toBe(true);
  });
  it("flags filler and first person", () => {
    const r = resumeSchema.parse({
      ...SAMPLE_RESUME,
      summary: "Results-driven engineer. I like code.",
    });
    const rep = scoreResume(r, kws);
    expect(rep.checks.find((c) => c.id === "filler")?.pass).toBe(false);
    expect(rep.checks.find((c) => c.id === "person")?.pass).toBe(false);
  });
  it("flags keyword stuffing", () => {
    const r = resumeSchema.parse({ ...SAMPLE_RESUME, summary: "react react react react react react" });
    expect(stuffedTerms(r, kws)).toContain("react");
  });
  it("flags bad date formats", () => {
    const e = { ...SAMPLE_RESUME.experience[0], start: "last spring" };
    const rep = scoreResume(resumeSchema.parse({ ...SAMPLE_RESUME, experience: [e] }), kws);
    expect(rep.checks.find((c) => c.id === "dates")?.pass).toBe(false);
  });
});
