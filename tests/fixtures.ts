import { resumeSchema, type Resume } from "@/lib/schema";

export const SAMPLE_JD = `We are hiring a Senior Frontend Engineer. You will build React and TypeScript
applications with Next.js, work with GraphQL APIs, write unit testing suites, and run CI/CD pipelines on AWS.
Experience with Docker, performance optimization and agile teams is required. Strong React and TypeScript skills.`;

export const SAMPLE_RESUME: Resume = resumeSchema.parse({
  contact: { fullName: "Asha Rao", email: "asha@example.com", phone: "+91 90000 00000", links: [] },
  summary: "Frontend engineer with 5 years building React and TypeScript products.",
  skills: [{ label: "Languages", items: ["TypeScript", "JavaScript"] }, { label: "Frameworks", items: ["React", "Next.js"] }],
  experience: [
    {
      id: "e1", company: "Acme", role: "Frontend Engineer", start: "Jan 2021", end: "Present",
      bullets: [
        "Built React dashboard used by 12,000 customers, cutting load time 38%",
        "Migrated 40 components to TypeScript, reducing production bugs by 25%",
        "Led CI/CD pipeline setup on AWS shortening release cycle from 5 days to 1",
      ],
    },
  ],
  education: [{ id: "d1", school: "VTU", degree: "B.E. Computer Science", end: "2019" }],
});
