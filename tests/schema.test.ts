import { describe, expect, it } from "vitest";
import { jdInputSchema, resumeSchema } from "@/lib/schema";
import { SAMPLE_RESUME } from "./fixtures";

describe("resumeSchema", () => {
  it("accepts a valid resume", () => {
    expect(resumeSchema.safeParse(SAMPLE_RESUME).success).toBe(true);
  });
  it("rejects unknown fields (strict)", () => {
    expect(resumeSchema.safeParse({ ...SAMPLE_RESUME, isAdmin: true }).success).toBe(false);
  });
  it("rejects invalid email and non-http links", () => {
    const bad = { ...SAMPLE_RESUME, contact: { ...SAMPLE_RESUME.contact, email: "nope" } };
    expect(resumeSchema.safeParse(bad).success).toBe(false);
    const js = { ...SAMPLE_RESUME, contact: { ...SAMPLE_RESUME.contact, links: [{ label: "x", url: "javascript:alert(1)" }] } };
    expect(resumeSchema.safeParse(js).success).toBe(false);
  });
  it("strips control characters and trims", () => {
    const r = resumeSchema.parse({ ...SAMPLE_RESUME, summary: "  hi\u0000 there  " });
    expect(r.summary).toBe("hi there");
  });
  it("enforces bullet length and count caps", () => {
    const e = { ...SAMPLE_RESUME.experience[0], bullets: Array(9).fill("x") };
    expect(resumeSchema.safeParse({ ...SAMPLE_RESUME, experience: [e] }).success).toBe(false);
    const long = { ...SAMPLE_RESUME.experience[0], bullets: ["x".repeat(301)] };
    expect(resumeSchema.safeParse({ ...SAMPLE_RESUME, experience: [long] }).success).toBe(false);
  });
});

describe("jdInputSchema", () => {
  it("rejects too short / too long JDs", () => {
    expect(jdInputSchema.safeParse({ jd: "short" }).success).toBe(false);
    expect(jdInputSchema.safeParse({ jd: "x".repeat(12_001) }).success).toBe(false);
    expect(jdInputSchema.safeParse({ jd: "x".repeat(100) }).success).toBe(true);
  });
});
