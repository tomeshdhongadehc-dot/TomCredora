import { describe, expect, it } from "vitest";
import { headingOf, normaliseDate, parseResumeText } from "@/lib/import/parse";

const A = `ASHA RAO
Senior Frontend Engineer
Bengaluru, India | asha.rao@example.com | +91 98765 43210
linkedin.com/in/asharao | github.com/asharao

SUMMARY
Frontend engineer with seven years of experience.

EXPERIENCE
Senior Frontend Engineer
Acme Corp, Bengaluru    Jan 2021 - Present
• Rebuilt checkout in React and TypeScript, cutting load time by 38%
• Mentored four junior engineers and ran weekly code reviews
Frontend Developer
Globex    06/2018 – 12/2020
• Shipped a design system used by 12 product teams
• Migrated a legacy jQuery app to React without downtime

EDUCATION
B.Tech in Computer Science, VTU    2014 - 2018
CGPA: 8.4

SKILLS
Languages: JavaScript, TypeScript, Python
Tools: Git, Docker, Figma

PROJECTS
Open-source chart library (github.com/asha/charts)
• Maintained a 2k-star charting library
Technologies: React, D3

CERTIFICATIONS
• AWS Certified Developer
• Scrum Master

LANGUAGES
English, Hindi
`;

const B = `John A. Smith
john.smith@mail.co.uk  07700 900123  London, UK
Work Experience
Acme Ltd — Product Manager — March 2019 to present
- Led a team of 6 to launch a payments product
- Grew monthly revenue by 22%
Initech | Business Analyst | 2016 - 2019
- Wrote requirements for 3 internal tools
Education
University of Leeds
BSc Economics, 2012 - 2015
Technical Skills
SQL, Excel, Jira, Tableau`;

describe("headings", () => {
  it("recognises common headings in any case", () => {
    expect(headingOf("EXPERIENCE")).toBe("experience");
    expect(headingOf("Work Experience:")).toBe("experience");
    expect(headingOf("Professional Experience")).toBe("experience");
    expect(headingOf("Technical Skills")).toBe("skills");
    expect(headingOf("Skills & Tools")).toBe("skills");
    expect(headingOf("Education")).toBe("education");
    expect(headingOf("Certifications & Licenses")).toBe("certifications");
    expect(headingOf("Languages")).toBe("other");
    expect(headingOf("Professional Summary")).toBe("summary");
  });
  it("does not mistake ordinary lines for headings", () => {
    expect(headingOf("Built a skills matrix for the team")).toBeNull();
    expect(headingOf("Experience in React, Node")).toBeNull();
    expect(headingOf("Jan 2020 - Present")).toBeNull();
  });
});

describe("dates", () => {
  it("normalises to the formats the ATS check accepts", () => {
    expect(normaliseDate("sept. 2021")).toBe("Sep 2021");
    expect(normaliseDate("March 2019")).toBe("Mar 2019");
    expect(normaliseDate("9/2021")).toBe("09/2021");
    expect(normaliseDate("Current")).toBe("Present");
    expect(normaliseDate("2018")).toBe("2018");
  });
});

describe("a typical resume (role line, then company and dates)", () => {
  const r = parseResumeText(A);
  it("finds the contact details", () => {
    expect(r.resume.contact.fullName).toBe("Asha Rao");
    expect(r.resume.contact.email).toBe("asha.rao@example.com");
    expect(r.resume.contact.phone).toContain("98765");
    expect(r.resume.contact.location).toBe("Bengaluru, India");
    expect(r.resume.contact.headline).toBe("Senior Frontend Engineer");
    expect(r.resume.contact.links.map((l) => l.label)).toEqual(["LinkedIn", "GitHub"]);
    expect(r.resume.contact.links[0].url).toBe("https://linkedin.com/in/asharao");
  });
  it("reads both jobs with dates and bullets", () => {
    expect(r.resume.experience).toHaveLength(2);
    const [a, b] = r.resume.experience;
    expect(a).toMatchObject({ role: "Senior Frontend Engineer", company: "Acme Corp", start: "Jan 2021", end: "Present" });
    expect(a.bullets).toHaveLength(2);
    expect(a.bullets[0]).toContain("38%");
    expect(b).toMatchObject({ role: "Frontend Developer", company: "Globex", start: "06/2018", end: "12/2020" });
    expect(b.bullets).toHaveLength(2);
  });
  it("reads education, skills groups, projects and certifications", () => {
    expect(r.resume.education[0]).toMatchObject({ school: "VTU", start: "2014", end: "2018" });
    expect(r.resume.education[0].degree).toMatch(/B\.Tech/);
    expect(r.resume.education[0].details).toContain("8.4");
    expect(r.resume.skills.map((g) => g.label)).toEqual(["Languages", "Tools"]);
    expect(r.resume.skills[0].items).toEqual(["JavaScript", "TypeScript", "Python"]);
    expect(r.resume.projects[0].name).toContain("Open-source chart library");
    expect(r.resume.projects[0].tech).toEqual(["React", "D3"]);
    expect(r.resume.certifications).toEqual(["AWS Certified Developer", "Scrum Master"]);
  });
  it("says what it left out", () => {
    expect(r.notes.join(" ")).toMatch(/languages/i);
    expect(r.found).toMatchObject({ roles: 2, education: 1, skills: 6, projects: 1, certifications: 2 });
  });
});

describe("a plainer layout (dates on the same line, dashes for bullets)", () => {
  const r = parseResumeText(B);
  it("handles 'Company — Role — dates' and 'to present'", () => {
    expect(r.resume.contact.fullName).toBe("John A. Smith");
    expect(r.resume.contact.email).toBe("john.smith@mail.co.uk");
    expect(r.resume.experience).toHaveLength(2);
    expect(r.resume.experience[0]).toMatchObject({ role: "Product Manager", company: "Acme Ltd", start: "Mar 2019", end: "Present" });
    expect(r.resume.experience[1]).toMatchObject({ role: "Business Analyst", company: "Initech", start: "2016", end: "2019" });
    expect(r.resume.experience[0].bullets).toHaveLength(2);
  });
  it("reads education given on two lines and a flat skills list", () => {
    expect(r.resume.education[0].school).toBe("University of Leeds");
    expect(r.resume.education[0].degree).toMatch(/BSc/);
    expect(r.resume.skills[0].items).toEqual(["SQL", "Excel", "Jira", "Tableau"]);
  });
});

describe("text extracted from a PDF (no bullet glyphs, wrapped lines)", () => {
  const r = parseResumeText(`Priya Nair
priya@example.com
EXPERIENCE
Data Analyst
Initech Pvt Ltd Aug 2020 - Present
Built dashboards in Power BI that tracked sales for 40 managers and
cut report time by half
Automated monthly reporting with Python and SQL`);
  it("joins wrapped lines into one point and keeps separate points apart", () => {
    const b = r.resume.experience[0].bullets;
    expect(b).toHaveLength(2);
    expect(b[0]).toContain("cut report time by half");
  });
});

describe("hostile or odd input", () => {
  it("never throws, and an empty paste gives guidance", () => {
    for (const t of ["", "   \n\n", "\u0000\u0001", "x".repeat(200_000), "EXPERIENCE\n".repeat(500), "<script>alert(1)</script>"]) expect(() => parseResumeText(t)).not.toThrow();
    const r = parseResumeText("");
    expect(r.notes.join(" ")).toContain("could not");
  });
  it("keeps text as text (no markup is interpreted) and respects the limits", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Role ${i} Engineer\nCo ${i}   Jan 20${10 + (i % 10)} - Dec 2020\n• did a thing`).join("\n");
    const r = parseResumeText(`Jo Bloggs\njo@example.com\nEXPERIENCE\n${many}`);
    expect(r.resume.experience.length).toBeLessThanOrEqual(12);
    const x = parseResumeText("Eve <img src=x onerror=alert(1)>\neve@example.com");
    expect(x.resume.contact.fullName).not.toMatch(/</);
  });
});
