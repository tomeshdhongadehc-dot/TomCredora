/**
 * Quick-pick content for the profile page, so most of it is tapping instead of typing.
 *
 * Honesty rule: nothing here is ever added for the user. Skills, duties and certifications are only suggestions
 * the user must tap, and duty starters deliberately contain no numbers or results (the user adds real ones).
 */

export interface Family {
  id: string;
  label: string;
  /** Typical job titles (shown as suggestions while typing a title or headline). */
  titles: string[];
  /** Skill groups, each a label plus tap-to-add chips. */
  skills: { label: string; items: string[] }[];
  /** Plain statements of what someone in this field does. Tapped ones become bullets the user can edit. */
  duties: string[];
  certs: string[];
}

const SOFT = ["Communication", "Teamwork", "Problem solving", "Leadership", "Time management", "Mentoring", "Stakeholder management", "Presentation"];

export const FAMILIES: Family[] = [
  {
    id: "software",
    label: "Software & IT",
    titles: ["Software Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer", "DevOps Engineer", "QA Engineer", "Mobile Developer", "Site Reliability Engineer"],
    skills: [
      { label: "Languages", items: ["JavaScript", "TypeScript", "Python", "Java", "C#", "C++", "Go", "Kotlin", "Swift", "SQL", "PHP", "Ruby"] },
      { label: "Frameworks", items: ["React", "Next.js", "Node.js", "Angular", "Vue.js", "Spring Boot", "Django", "Flask", "Express", ".NET", "Tailwind CSS", "GraphQL"] },
      { label: "Tools", items: ["Git", "Docker", "Kubernetes", "AWS", "Azure", "GCP", "CI/CD", "Jenkins", "Terraform", "Linux", "PostgreSQL", "MongoDB", "Redis", "Jira"] },
      { label: "Soft skills", items: SOFT },
    ],
    duties: [
      "Built and maintained web applications",
      "Designed and shipped new product features",
      "Wrote automated tests and fixed bugs",
      "Reviewed code and mentored teammates",
      "Improved application performance",
      "Built and consumed REST APIs",
      "Set up deployment pipelines",
      "Worked with designers and product managers",
    ],
    certs: ["AWS Certified Developer - Associate", "AWS Certified Solutions Architect - Associate", "Microsoft Azure Fundamentals (AZ-900)", "Google Associate Cloud Engineer", "Certified Kubernetes Administrator (CKA)", "Oracle Certified Professional, Java SE"],
  },
  {
    id: "data",
    label: "Data & AI",
    titles: ["Data Analyst", "Data Scientist", "Data Engineer", "Machine Learning Engineer", "Business Intelligence Analyst", "Analytics Engineer"],
    skills: [
      { label: "Languages", items: ["Python", "SQL", "R", "Scala", "Java", "Bash"] },
      { label: "Tools", items: ["Excel", "Power BI", "Tableau", "Looker", "Pandas", "NumPy", "Spark", "Airflow", "dbt", "Snowflake", "BigQuery", "Databricks", "Git", "AWS"] },
      { label: "Methods", items: ["Machine learning", "Statistics", "A/B testing", "Data modeling", "ETL", "Forecasting", "NLP", "Data visualization", "Dashboards"] },
      { label: "Soft skills", items: SOFT },
    ],
    duties: [
      "Built dashboards and reports for business teams",
      "Cleaned and prepared data for analysis",
      "Wrote SQL queries to answer business questions",
      "Built and evaluated machine learning models",
      "Designed and maintained data pipelines",
      "Presented findings to stakeholders",
      "Automated recurring reports",
    ],
    certs: ["Google Data Analytics Certificate", "Microsoft Power BI Data Analyst (PL-300)", "AWS Certified Data Engineer - Associate", "Databricks Certified Data Engineer Associate", "Tableau Desktop Specialist"],
  },
  {
    id: "design",
    label: "Design & Creative",
    titles: ["UI/UX Designer", "Product Designer", "Graphic Designer", "Visual Designer", "UX Researcher", "Motion Designer", "Content Designer"],
    skills: [
      { label: "Tools", items: ["Figma", "Adobe XD", "Photoshop", "Illustrator", "After Effects", "InDesign", "Sketch", "Webflow", "Miro", "Canva"] },
      { label: "Skills", items: ["Wireframing", "Prototyping", "User research", "Design systems", "Visual design", "Typography", "Branding", "Usability testing", "Accessibility", "Interaction design"] },
      { label: "Soft skills", items: SOFT },
    ],
    duties: [
      "Designed screens and user flows for web and mobile products",
      "Ran user research and usability tests",
      "Built and maintained a design system",
      "Created prototypes and handed designs to developers",
      "Designed marketing and brand materials",
      "Worked with product managers and engineers",
    ],
    certs: ["Google UX Design Certificate", "Nielsen Norman Group UX Certification", "Adobe Certified Professional", "Interaction Design Foundation certificate"],
  },
  {
    id: "product",
    label: "Product & Project",
    titles: ["Product Manager", "Associate Product Manager", "Project Manager", "Program Manager", "Business Analyst", "Scrum Master", "Product Owner"],
    skills: [
      { label: "Tools", items: ["Jira", "Confluence", "Asana", "Notion", "Figma", "SQL", "Excel", "Google Analytics", "Mixpanel", "Trello", "MS Project"] },
      { label: "Methods", items: ["Agile", "Scrum", "Kanban", "Roadmapping", "User stories", "Prioritization", "A/B testing", "Market research", "Risk management", "Budgeting", "OKRs"] },
      { label: "Soft skills", items: SOFT },
    ],
    duties: [
      "Owned the product roadmap and backlog",
      "Wrote requirements and user stories",
      "Coordinated work across engineering, design and business teams",
      "Ran sprint planning and retrospectives",
      "Tracked project timelines, risks and budgets",
      "Analyzed product data to decide priorities",
      "Reported progress to stakeholders",
    ],
    certs: ["PMP", "Certified ScrumMaster (CSM)", "PMI-ACP", "Professional Scrum Product Owner (PSPO I)", "SAFe Agilist"],
  },
  {
    id: "marketing",
    label: "Marketing & Content",
    titles: ["Digital Marketing Manager", "Content Writer", "SEO Specialist", "Social Media Manager", "Marketing Executive", "Brand Manager", "Performance Marketer"],
    skills: [
      { label: "Tools", items: ["Google Analytics", "Google Ads", "Meta Ads", "SEMrush", "Ahrefs", "HubSpot", "Mailchimp", "WordPress", "Canva", "Hootsuite", "Excel"] },
      { label: "Skills", items: ["SEO", "Content strategy", "Copywriting", "Email marketing", "Social media", "Paid campaigns", "Brand strategy", "Analytics", "Lead generation", "Market research"] },
      { label: "Soft skills", items: SOFT },
    ],
    duties: [
      "Planned and ran marketing campaigns",
      "Wrote blog posts, emails and social content",
      "Managed paid ads and monitored results",
      "Improved search rankings with on-page SEO",
      "Reported on campaign performance",
      "Managed social media accounts",
      "Worked with sales and design teams",
    ],
    certs: ["Google Ads Certification", "Google Analytics Certification", "HubSpot Content Marketing Certification", "Meta Certified Digital Marketing Associate"],
  },
  {
    id: "sales",
    label: "Sales & Business",
    titles: ["Sales Executive", "Account Manager", "Business Development Manager", "Sales Manager", "Customer Success Manager", "Inside Sales Representative"],
    skills: [
      { label: "Tools", items: ["Salesforce", "HubSpot", "Zoho CRM", "LinkedIn Sales Navigator", "Excel", "Outreach", "Zoom"] },
      { label: "Skills", items: ["Lead generation", "Cold outreach", "Negotiation", "Account management", "Pipeline management", "Forecasting", "Closing deals", "Client relationships", "Upselling", "Product demos"] },
      { label: "Soft skills", items: SOFT },
    ],
    duties: [
      "Generated and qualified new leads",
      "Managed client accounts and renewals",
      "Ran product demos and prepared proposals",
      "Negotiated and closed deals",
      "Tracked pipeline and forecasts in the CRM",
      "Worked with marketing and product teams",
    ],
    certs: ["Salesforce Certified Administrator", "HubSpot Sales Software Certification", "Certified Sales Professional"],
  },
  {
    id: "finance",
    label: "Finance & Accounting",
    titles: ["Accountant", "Financial Analyst", "Auditor", "Tax Associate", "Accounts Executive", "Investment Analyst", "Risk Analyst"],
    skills: [
      { label: "Tools", items: ["Excel", "Tally", "SAP", "QuickBooks", "Power BI", "Oracle", "Bloomberg", "SQL"] },
      { label: "Skills", items: ["Financial reporting", "Budgeting", "Forecasting", "Reconciliation", "Auditing", "Taxation", "GST", "Accounts payable", "Accounts receivable", "Financial modeling", "Variance analysis", "Compliance"] },
      { label: "Soft skills", items: SOFT },
    ],
    duties: [
      "Prepared monthly financial reports and statements",
      "Reconciled accounts and resolved discrepancies",
      "Built budgets and forecasts",
      "Handled payables, receivables and payroll entries",
      "Supported audits and tax filings",
      "Analyzed variances and reported to management",
    ],
    certs: ["CA (Chartered Accountant)", "CFA Level I", "ACCA", "CPA", "Financial Modeling & Valuation Analyst (FMVA)"],
  },
  {
    id: "operations",
    label: "Operations & Supply Chain",
    titles: ["Operations Manager", "Operations Executive", "Supply Chain Analyst", "Logistics Coordinator", "Procurement Specialist", "Quality Analyst", "Administrative Assistant"],
    skills: [
      { label: "Tools", items: ["Excel", "SAP", "Oracle", "Power BI", "Tableau", "ERP systems", "MS Office", "Google Workspace"] },
      { label: "Skills", items: ["Process improvement", "Inventory management", "Vendor management", "Logistics", "Procurement", "Quality control", "Lean", "Six Sigma", "Scheduling", "Reporting", "Cost reduction"] },
      { label: "Soft skills", items: SOFT },
    ],
    duties: [
      "Managed day-to-day operations and schedules",
      "Coordinated with vendors and suppliers",
      "Tracked inventory and orders",
      "Improved processes to cut delays and cost",
      "Prepared operational reports",
      "Led a team and trained new staff",
    ],
    certs: ["Lean Six Sigma Green Belt", "Six Sigma Yellow Belt", "CSCP (APICS)", "PMP"],
  },
  {
    id: "hr",
    label: "HR & Recruiting",
    titles: ["HR Executive", "Talent Acquisition Specialist", "Recruiter", "HR Business Partner", "People Operations Manager", "Payroll Executive"],
    skills: [
      { label: "Tools", items: ["Workday", "Zoho People", "Naukri", "LinkedIn Recruiter", "Greenhouse", "Excel", "HRIS", "ATS"] },
      { label: "Skills", items: ["Recruitment", "Sourcing", "Interviewing", "Onboarding", "Employee relations", "Payroll", "Performance management", "Training", "HR policies", "Labour law", "Engagement"] },
      { label: "Soft skills", items: SOFT },
    ],
    duties: [
      "Sourced, screened and interviewed candidates",
      "Ran onboarding for new hires",
      "Managed employee records and payroll inputs",
      "Handled employee queries and relations",
      "Organised training and engagement activities",
      "Worked with hiring managers to fill roles",
    ],
    certs: ["SHRM-CP", "PHR", "Certified Talent Acquisition Specialist", "Labour law compliance certificate"],
  },
  {
    id: "support",
    label: "Support & Service",
    titles: ["Customer Support Executive", "Technical Support Engineer", "Customer Service Representative", "Help Desk Analyst", "Client Services Associate"],
    skills: [
      { label: "Tools", items: ["Zendesk", "Freshdesk", "Salesforce", "Jira", "Slack", "Excel", "ServiceNow", "Intercom"] },
      { label: "Skills", items: ["Customer service", "Ticket handling", "Troubleshooting", "Live chat", "Phone support", "Escalation handling", "Documentation", "CRM", "Product knowledge", "Conflict resolution"] },
      { label: "Soft skills", items: SOFT },
    ],
    duties: [
      "Answered customer queries by phone, email and chat",
      "Resolved technical issues and escalated when needed",
      "Documented fixes and wrote help articles",
      "Tracked tickets to resolution",
      "Gave feedback to product and engineering teams",
      "Trained new team members",
    ],
    certs: ["HDI Customer Service Representative", "ITIL 4 Foundation", "CompTIA A+", "Zendesk Support Administrator"],
  },
];

export const familyById = (id: string): Family | undefined => FAMILIES.find((f) => f.id === id);

/** Common degrees as one-tap choices. "Other" lets the user type their own. */
export const DEGREES = [
  "B.Tech / B.E.", "B.Sc", "BCA", "B.Com", "BBA", "BA",
  "M.Tech / M.E.", "M.Sc", "MCA", "M.Com", "MBA", "MA",
  "Diploma", "PhD", "12th / High school",
] as const;

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Years for pickers: this year back 45 years. Pass the year in so the list is testable. */
export const yearsFrom = (thisYear: number, span = 45): string[] => Array.from({ length: span + 1 }, (_, i) => String(thisYear - i));

/** "Jan 2022" from a month and a year; either missing gives just what exists (or ""). */
export const formatDate = (month: string, year: string): string => [month, year].filter(Boolean).join(" ");

/** Split a stored date ("Jan 2022", "2019", "Jan" while the year is still to be picked, "Present") back into picker values. */
export function parseDate(s: string): { month: string; year: string } {
  const m = /^(?:([A-Za-z]{3})[a-z]*)?\s*(\d{4})?$/.exec(s.trim());
  if (!m || (!m[1] && !m[2])) return { month: "", year: "" };
  const month = MONTHS.find((x) => x.toLowerCase() === (m[1] ?? "").toLowerCase()) ?? "";
  return { month, year: m[2] ?? "" };
}
