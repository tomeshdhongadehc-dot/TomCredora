import { describe, expect, it } from "vitest";
import { checkEmbellishment, stem } from "@/lib/ai/embellishment";

const CTX = ["Engineer", "Acme", "React TypeScript SQL Git"];
const check = (source: string, bullet: string) => checkEmbellishment(bullet, [source, ...CTX]);

describe("embellishment: real outputs from the live eval (must be flagged)", () => {
  const cases: [string, string, string][] = [
    ["invented activities + 'active' + 'high-traffic'", "Built dashboards in React used by 5,000 users", "Engineered high-traffic React dashboards serving 5,000 active users by optimizing component architecture and state management"],
    ["'helped with releases' became automated pipelines + unit testing", "Fixed bugs and helped with releases", "Automated release pipelines and implemented unit testing strategies to reduce deployment errors and improve code reliability"],
    ["an achievement invented from 'did various tasks'", "Did various tasks for the team", "Develop web application features using React and TypeScript to improve user interface functionality and system performance"],
    ["SQL reports became 'actionable financial insights for stakeholders'", "Wrote SQL reports for finance team", "Developed complex SQL reports to provide actionable financial insights for cross-functional stakeholders"],
    ["invented purpose clause: 'to streamline financial data analysis'", "Wrote SQL reports for finance team", "Authored SQL reports for the finance team to streamline financial data analysis"],
    ["'active users' invented", "Built dashboards in React used by 5,000 users", "Developed user-facing dashboards using React and TypeScript to support over 5,000 active users"],
    ["invented outcome: 'to maintain application stability'", "Fixed bugs and helped with releases", "Resolved software bugs and assisted with release management processes to maintain application stability"],
    ["invented method: 'by optimizing component architecture'", "Built dashboards in React used by 5,000 users", "Built React dashboards used by 5,000 users by optimizing component architecture"],
    ["vague source padded with a fake achievement", "Did various tasks for the team", "Collaborated on engineering tasks to support team deliverables and maintain application codebases"],
  ];
  for (const [name, src, out] of cases) {
    it(name, () => {
      const r = check(src, out);
      expect(r.flagged, `novel: ${r.novel.join(", ")}`).toBe(true);
      expect(r.novel.length).toBeGreaterThanOrEqual(1);
    });
  }
});

describe("embellishment: legitimate rewrites are NOT flagged", () => {
  const ok: [string, string, string][] = [
    ["reordered", "Built dashboards in React used by 5,000 users", "Built React dashboards used by 5,000 users"],
    ["verb swapped", "Built dashboards in React used by 5,000 users", "Developed React dashboards for 5,000 users"],
    ["article added", "Wrote SQL reports for finance team", "Wrote SQL reports for the finance team"],
    ["unchanged", "Rebuilt checkout in React and TypeScript, lifting conversion 14% across 2M monthly users", "Rebuilt checkout in React and TypeScript, lifting conversion 14% across 2M monthly users"],
    ["shortened with a synonym verb", "Migrated 40 legacy components to TypeScript, reducing production bugs by 25%", "Migrated 40 legacy components to TypeScript, cutting production bugs 25%"],
    ["compressed", "Led a team of 4 engineers and shipped a shared design system adopted by 9 products", "Led 4 engineers to ship a design system adopted by 9 products"],
    ["synonym verbs only (fixed->resolved, helped->supported)", "Fixed bugs and helped with releases", "Resolved bugs and supported releases"],
    ["synonym with generic noun added", "Fixed bugs and helped with releases", "Resolved software bugs and supported production releases"],
    ["'to' as a preposition is not a purpose clause", "Migrated 40 components to TypeScript", "Migrated 40 components to TypeScript"],
    ["same method clause as the source", "Cut costs 20% by consolidating vendors", "Reduced costs 20% by consolidating vendors"],
    ["tense changed", "Automated releases with CI/CD on AWS, shortening the cycle from 5 days to 1", "Automate releases with CI/CD on AWS, shortening the cycle from 5 days to 1"],
  ];
  for (const [name, src, out] of ok) {
    it(name, () => {
      const r = checkEmbellishment(out, [src, "Frontend Engineer", "Acme", "React TypeScript CI/CD AWS SQL"]);
      expect(r.flagged, `novel: ${r.novel.join(", ")}`).toBe(false);
    });
  }
});

describe("stem", () => {
  it("treats inflections as one word but keeps short words intact", () => {
    expect(stem("dashboards")).toBe(stem("dashboard"));
    expect(stem("optimizing")).toBe(stem("optimized"));
    expect(stem("api")).toBe("api");
    expect(stem("sql")).toBe("sql");
  });
});

describe("embellishment: a spelled-out unit is not an invented claim", () => {
  it("'25%' rewritten as '25 percent' is not flagged (seen in a live Gemini run); a new claim next to it still is", () => {
    const src = "Migrated 40 legacy components to TypeScript, reducing production bugs by 25%";
    expect(check(src, "Migrated 40 legacy components to TypeScript, reducing production bugs by 25 percent").flagged).toBe(false);
    expect(check(src, "Migrated 40 legacy components to TypeScript, reducing production bugs by 25 percent by optimizing component architecture").flagged).toBe(true);
  });
});
