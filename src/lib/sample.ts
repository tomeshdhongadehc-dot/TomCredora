import { SCHEMA_VERSION, type Resume } from "./schema";

/** Demo data for first-run "try it" and template thumbnails when the user has not typed yet. */
export const SAMPLE_RESUME: Resume = {
  schemaVersion: SCHEMA_VERSION,
  contact: { fullName: "Asha Rao", headline: "Senior Frontend Engineer", email: "asha.rao@example.com", phone: "+91 90000 00000", location: "Bengaluru, India", links: [{ label: "LinkedIn", url: "https://linkedin.com/in/asharao" }] },
  summary: "Frontend engineer with 6 years building React and TypeScript products used by millions. Focused on performance, accessibility and clean design systems.",
  skills: [
    { label: "Languages", items: ["TypeScript", "JavaScript", "HTML", "CSS"] },
    { label: "Frameworks", items: ["React", "Next.js", "Tailwind"] },
    { label: "Tools", items: ["Git", "Docker", "AWS", "CI/CD"] },
  ],
  experience: [
    {
      id: "s1", company: "Acme Corp", role: "Senior Frontend Engineer", location: "Bengaluru", start: "Jan 2022", end: "Present",
      bullets: [
        "Rebuilt checkout in React and TypeScript, lifting conversion 14% across 2M monthly users",
        "Cut page load time 38% by introducing code splitting and image optimization",
        "Led a team of 4 engineers and shipped a shared design system adopted by 9 products",
      ],
    },
    {
      id: "s2", company: "Globex", role: "Frontend Engineer", location: "Pune", start: "Jul 2019", end: "Dec 2021",
      bullets: [
        "Migrated 40 legacy components to TypeScript, reducing production bugs by 25%",
        "Automated releases with CI/CD on AWS, shortening the cycle from 5 days to 1",
      ],
    },
  ],
  projects: [],
  education: [{ id: "se1", school: "VTU", degree: "B.E. Computer Science", start: "2015", end: "2019", details: "" }],
  certifications: ["AWS Certified Developer - Associate"],
};
