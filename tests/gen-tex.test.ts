// Generates .tex samples for the manual compile check. Writes only when TEX_OUT is set.
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { renderLatex } from "@/lib/export/latex";
import { SAMPLE_RESUME } from "@/lib/sample";
import { resumeSchema } from "@/lib/schema";
import { PRESETS } from "@/lib/templates";

const OUT = process.env.TEX_OUT;

const edge = resumeSchema.parse({
  contact: { fullName: "José Müller-Øster & Co.", headline: "R&D Lead | 100% remote", email: "jose_m@example.com", phone: "+91 98765 43210", location: "São Paulo, Brasil", links: [{ label: "Site", url: "https://example.com/~jose/a_b?x=1&y=2#top" }] },
  summary: "Saved ₹2M & €1.5M ($3M) via 50% faster builds; “smart quotes” — em dash – en dash … and #1 ranking in C++/C#. Backslash \\ tilde ~ caret ^ braces {x}.",
  skills: [{ label: "Languages", items: ["C++", "C#", "F#", "R", "Node.js", "SQL_Server", "Ångström"] }],
  experience: Array.from({ length: 5 }, (_, i) => ({
    id: `x${i}`, company: `Société Générale ${i}`, role: "Senior Engineer • Platform", location: "Zürich", start: "Jan 2020", end: "Present",
    bullets: Array.from({ length: 5 }, (_, k) => `Reduced latency 30% & cost $4k/month for 10M+ users; wrote 100_000 LOC in C#/F# with {braces} and \\textbf{x} injected ${i}.${k} → shipped`),
  })),
  education: [{ id: "e", school: "École Polytechnique", degree: "M.Sc. Computer Science", start: "2012", end: "2014", details: "GPA 3.9/4.0" }],
  certifications: ["AWS – Solutions Architect", "© Certified Kubernetes (CKA)"],
});

describe.skipIf(!OUT)("write tex samples", () => {
  it("writes", () => {
    mkdirSync(OUT!, { recursive: true });
    for (const p of PRESETS) {
      writeFileSync(`${OUT}/${p.id}.tex`, renderLatex(SAMPLE_RESUME, p.config));
      writeFileSync(`${OUT}/${p.id}-edge.tex`, renderLatex(edge, p.config));
    }
  });
});
