import { describe, expect, it } from "vitest";
import { emptyResume } from "@/lib/draft-model";
import type { Resume } from "@/lib/schema";
import { addSkill, alignSkillsToJd, isKnownSkill, jdSkills, removeSkill, skillGap } from "@/lib/skill-gap";

const JD = "Senior Frontend Engineer building React and TypeScript apps with Next.js, GraphQL and AWS. Docker and Kubernetes required. Strong communication.";

const resume = (over: Partial<Resume> = {}): Resume => ({
  ...emptyResume(),
  contact: { fullName: "A B", headline: "", email: "a@b.co", phone: "", location: "", links: [] },
  skills: [{ label: "Tools", items: ["Git", "Docker", "React"] }],
  experience: [{ id: "e1", company: "Acme", role: "Engineer", location: "", start: "2020", end: "Present", bullets: ["Built dashboards in React", "Automated releases with Terraform"] }],
  ...over,
});

const allSkills = (r: Resume) => r.skills.flatMap((g) => g.items);

describe("skills named in a job description", () => {
  it("finds the technical skills, in the catalog's spelling, and ignores generic or soft words", () => {
    const s = jdSkills(JD);
    for (const want of ["React", "TypeScript", "Next.js", "GraphQL", "AWS", "Docker", "Kubernetes"]) expect(s, want).toContain(want);
    expect(s).not.toContain("Communication");
  });

  it("does not mistake ordinary English for a skill ('excel in', 'go to market', 'R&D')", () => {
    const s = jdSkills("You will excel in a fast-paced team, go to market quickly and support R&D. We value people who excel at teamwork.");
    expect(s).not.toContain("Excel");
    expect(s).not.toContain("Go");
    expect(s).not.toContain("R");
    expect(jdSkills("Advanced Excel and SQL required")).toEqual(expect.arrayContaining(["Excel", "SQL"]));
    expect(jdSkills("Proficient in Excel with pivot tables")).toContain("Excel");
  });

  it("understands common abbreviations", () => {
    const s = jdSkills("Experience with k8s, js, postgres and ML");
    expect(s).toEqual(expect.arrayContaining(["Kubernetes", "JavaScript", "PostgreSQL", "Machine learning"]));
  });

  it("puts the most-mentioned skill first", () => {
    expect(jdSkills("Python, Python, Python and a little Java")[0]).toBe("Python");
  });
});

describe("gap between the job and the user", () => {
  it("separates skills the user has (anywhere in the profile) from skills nothing mentions", () => {
    const g = skillGap(JD, resume());
    expect(g.have).toEqual(expect.arrayContaining(["React", "Docker"]));
    expect(g.missing).toEqual(expect.arrayContaining(["TypeScript", "GraphQL", "AWS", "Kubernetes", "Next.js"]));
    expect(g.have.some((x) => g.missing.includes(x))).toBe(false);
  });

  it("a skill that appears only inside a bullet counts as had", () => {
    expect(skillGap("Terraform required", resume()).have).toEqual(["Terraform"]);
  });

  it("an abbreviation in the profile counts: 'JS' covers a job asking for JavaScript", () => {
    const r = resume({ skills: [{ label: "Languages", items: ["JS"] }] });
    expect(skillGap("JavaScript developer", r)).toEqual({ have: ["JavaScript"], missing: [] });
  });
});

describe("HONESTY: aligning skills to a job never adds a skill the user does not have", () => {
  it("missing skills stay out, however many the job lists", () => {
    const r = resume();
    const out = alignSkillsToJd(r, JD);
    for (const m of ["TypeScript", "GraphQL", "AWS", "Kubernetes", "Next.js"]) expect(allSkills(out), m).not.toContain(m);
  });

  it("everything added or renamed was already in the profile text", () => {
    const r = resume({ skills: [{ label: "Languages", items: ["JS", "Py"] }] });
    const out = alignSkillsToJd(r, "JavaScript, Python, Rust, Kotlin, Swift, Terraform");
    const before = JSON.stringify(r).toLowerCase();
    for (const s of allSkills(out)) {
      const l = s.toLowerCase();
      expect(before.includes(l) || (l === "javascript" && before.includes('"js"')), `"${s}" was invented`).toBe(true);
    }
    expect(allSkills(out)).not.toContain("Rust");
    expect(allSkills(out)).not.toContain("Python"); // "Py" is not a known abbreviation, so it is not assumed to mean Python
  });

  it("random job descriptions never grow the skill list beyond what the resume text supports", () => {
    const r = resume();
    const text = JSON.stringify(r).toLowerCase();
    const words = ["react", "docker", "git", "terraform", "java", "python", "sql", "aws", "figma", "tableau", "jira", "rust", "kafka", "spark"];
    for (let i = 0; i < 40; i++) {
      const jd = Array.from({ length: 6 }, (_, k) => words[(i * 7 + k * 3) % words.length]).join(" and ");
      for (const s of allSkills(alignSkillsToJd(r, jd))) expect(text.includes(s.toLowerCase()), `${jd} -> ${s}`).toBe(true);
    }
  });
});

describe("aligning skills to a job helps without inventing", () => {
  it("lifts the skills the job wants to the front of their group", () => {
    const out = alignSkillsToJd(resume(), "React and Docker");
    expect(out.skills[0].items.slice(0, 2).sort()).toEqual(["Docker", "React"]);
    expect(out.skills[0].items[2]).toBe("Git");
  });

  it("uses the job's wording for the same skill, without duplicates", () => {
    const r = resume({ skills: [{ label: "Tools", items: ["k8s", "JS", "Git"] }], experience: [] });
    const out = alignSkillsToJd(r, "JavaScript and Kubernetes");
    expect(out.skills[0].items).toEqual(["Kubernetes", "JavaScript", "Git"]); // the user's own order is kept
  });

  it("adds a wanted skill that the user's own bullets show but their skills list forgot", () => {
    const out = alignSkillsToJd(resume(), "Terraform");
    expect(allSkills(out)).toContain("Terraform");
  });

  it("changes nothing when the job names no recognisable skill", () => {
    const r = resume();
    expect(alignSkillsToJd(r, "We are a friendly team with great snacks and a nice office.")).toBe(r);
  });

  it("does not mutate its input", () => {
    const r = resume();
    const before = JSON.stringify(r);
    alignSkillsToJd(r, JD);
    expect(JSON.stringify(r)).toBe(before);
  });
});

describe("confirming a skill ('I have this')", () => {
  it("adds it to the group it belongs to, once", () => {
    const r = resume({ skills: [{ label: "Tools", items: ["Git"] }] });
    const a = addSkill(r, "Docker");
    expect(a.skills).toEqual([{ label: "Tools", items: ["Git", "Docker"] }]);
    expect(addSkill(a, "docker")).toBe(a);
  });

  it("puts an unknown skill under 'Other skills'", () => {
    const a = addSkill(resume(), "Kafka-Streams");
    expect(a.skills.at(-1)).toEqual({ label: "Other skills", items: ["Kafka-Streams"] });
  });

  it("respects the schema limits (25 items per group, 8 groups)", () => {
    const full = resume({ skills: [{ label: "Tools", items: Array.from({ length: 25 }, (_, i) => `t${i}`) }] });
    expect(addSkill(full, "Docker").skills.find((g) => g.label === "Tools")!.items).toHaveLength(25);
    const groups = resume({ skills: Array.from({ length: 8 }, (_, i) => ({ label: `G${i}`, items: ["x"] })) });
    expect(addSkill(groups, "Kafka-Streams").skills).toHaveLength(8);
  });

  it("can be taken back out, dropping a group that becomes empty", () => {
    const r = addSkill(resume({ skills: [] }), "Kafka-Streams");
    expect(removeSkill(r, "kafka-streams").skills).toEqual([]);
  });

  it("recognises skills the page can offer as one-tap", () => {
    expect(isKnownSkill("graphql")).toBe(true);
    expect(isKnownSkill("synergy")).toBe(false);
  });
});
