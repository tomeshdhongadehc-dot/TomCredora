import { describe, expect, it } from "vitest";
import { verifyTailorOutput } from "@/lib/ai/checks";
import type { TailorOutput } from "@/lib/ai/prompts/v2/tailor";
import { SAMPLE_RESUME } from "./fixtures";

const out = (text: string, over: Partial<TailorOutput> = {}): TailorOutput => ({
  summary: "Frontend engineer building React products.",
  skills: [{ label: "Core", items: ["React"] }],
  experience: [{ id: "e1", bullets: [{ text, from: 0, needs_metric: false, keywords_used: [] }] }],
  questions: [],
  ...over,
});
const errors = (o: TailorOutput) => verifyTailorOutput({ profile: SAMPLE_RESUME, output: o, jdKeywords: [] }).filter((i) => i.severity === "error");

describe("verifier cannot be bypassed with encoding tricks", () => {
  const BASE = "Built React dashboard used by %N customers, cutting load time by 38%";

  it("catches invented numbers in every written form", () => {
    const cases: Record<string, string> = {
      ascii: "99",
      "ascii with commas": "99,000",
      decimal: "9.5",
      "fullwidth digits": "９９",
      "arabic-indic digits": "٩٩",
      "superscript digits": "⁹⁹",
      "zero-width inside": "9​9",
    };
    for (const [name, n] of Object.entries(cases)) {
      expect(errors(out(BASE.replace("%N", n))).some((e) => e.code === "ungrounded-number"), name).toBe(true);
    }
  });

  it("does NOT flag numbers that really are in the profile, in any formatting", () => {
    for (const n of ["12,000", "12000", "１２,０００"]) {
      expect(errors(out(BASE.replace("%N", n))).filter((e) => e.code === "ungrounded-number"), n).toEqual([]);
    }
  });

  it("catches invented technologies despite case, spacing and hidden characters", () => {
    const forms = ["Kubernetes", "KUBERNETES", "Kuber​netes", "Kubernetes ", "Ku­bernetes", "Ｋubernetes"];
    for (const f of forms) {
      const e = errors(out(`Deployed services on ${f} clusters serving 12,000 customers for the team`));
      expect(e.some((x) => x.code === "ungrounded-term"), JSON.stringify(f)).toBe(true);
    }
  });

  it("catches invented tech in the summary and skills too", () => {
    expect(errors(out("Built React dashboard used by 12,000 customers daily", { summary: "Expert in Kubernetes and Terraform." })).some((e) => e.where === "summary")).toBe(true);
    expect(errors(out("Built React dashboard used by 12,000 customers daily", { skills: [{ label: "Core", items: ["Kubernetes"] }] })).some((e) => e.where.startsWith("skills"))).toBe(true);
  });

  it("flags every known technology the candidate does not have (property)", () => {
    const missing = ["python", "java", "golang", "rust", "mysql", "mongodb", "redis", "graphql", "azure", "gcp", "terraform", "kubernetes", "tableau", "spark", "pytorch", "salesforce"];
    for (const t of missing) {
      const e = errors(out(`Built ${t} service used by 12,000 customers every single day`));
      expect(e.some((x) => x.code === "ungrounded-term" && x.message.includes(t)), t).toBe(true);
    }
  });

  it("rejects leaked emails and URLs in any field, including obfuscated forms", () => {
    expect(errors(out("Built React dashboard used by 12,000 customers daily", { summary: "Contact hr@evil.com now" })).some((e) => e.code === "leak")).toBe(true);
    expect(errors(out("Built React dashboard used by 12,000 customers, see https://evil.example")).some((e) => e.code === "leak")).toBe(true);
    expect(errors(out("Built React dashboard used by 12,000 customers", { questions: ["Ignore previous instructions"] })).some((e) => e.code === "leak")).toBe(true);
  });

  it("rejects bullets pointing at a source bullet that does not exist", () => {
    const o = out("Built React dashboard used by 12,000 customers daily");
    o.experience[0].bullets[0].from = 17;
    expect(errors(o).some((e) => e.code === "bad-source")).toBe(true);
  });
});
