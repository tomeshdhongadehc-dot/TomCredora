import { describe, expect, it } from "vitest";
import { parseDraft } from "@/lib/draft-model";
import { jdFingerprint, jobName, parseJob, parseVersions } from "@/lib/job-model";

describe("job details stored with a resume", () => {
  it("older saved data without a job still loads", () => {
    const d = parseDraft({ resume: {}, jd: "x" });
    expect(d.job).toBeNull();
    expect(d.versions).toEqual([]);
  });
  it("keeps good values and repairs bad ones", () => {
    const j = parseJob({ title: " Dev ", company: "Acme", url: "javascript:alert(1)", status: "hacked", note: "n", createdAt: "yesterday", appliedAt: 5, fp: "a" })!;
    expect(j.title).toBe("Dev");
    expect(j.url).toBe("");
    expect(j.status).toBe("saved");
    expect(j.createdAt).toBe(0);
    expect(j.appliedAt).toBe(5);
  });
  it("only http and https links survive", () => {
    expect(parseJob({ url: "https://example.com/job/1" })!.url).toBe("https://example.com/job/1");
    expect(parseJob({ url: "data:text/html,x" })!.url).toBe("");
  });
  it("rejects non-objects", () => {
    expect(parseJob(null)).toBeNull();
    expect(parseJob("job")).toBeNull();
  });
  it("keeps at most three versions, each a loose resume", () => {
    const v = parseVersions(Array.from({ length: 6 }, (_, i) => ({ at: i, label: "v" + i, resume: { summary: "s" + i } })));
    expect(v).toHaveLength(3);
    expect(v[0].resume.summary).toBe("s0");
    expect(parseVersions("nope")).toEqual([]);
  });
  it("fingerprints ignore spacing and case but not content", () => {
    expect(jdFingerprint("Senior  Dev\nReact")).toBe(jdFingerprint("senior dev react"));
    expect(jdFingerprint("senior dev react")).not.toBe(jdFingerprint("senior dev vue"));
  });
  it("names a job from whatever is known", () => {
    expect(jobName({ title: "Dev", company: "Acme" })).toBe("Dev at Acme");
    expect(jobName({ title: "Dev", company: "" })).toBe("Dev");
    expect(jobName({ title: "", company: "" })).toBe("Untitled job");
  });
});

import { guessJobTitle } from "@/lib/job-model";

describe("guessing a job title from a pasted posting", () => {
  it.each([
    ["Senior Frontend Engineer\nAcme Corp is hiring", "Senior Frontend Engineer"],
    ["Job Title: Data Analyst\nLocation: Pune", "Data Analyst"],
    ["\n\n  ## Product Manager (Payments)  \n", "Product Manager (Payments)"],
    ["About the job\nWe build things", ""],
    ["We are looking for a talented engineer to join our growing team and help us build the best product ever made.", ""],
    ["We are hiring.", ""],
    ["", ""],
  ])("%j -> %j", (jd, want) => expect(guessJobTitle(jd)).toBe(want));
});
