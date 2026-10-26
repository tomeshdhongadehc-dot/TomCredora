import { extractKeywords, type Keyword } from "@/lib/keywords";
import { resumeSchema, type Resume } from "@/lib/schema";
import { asciiPunctuation } from "@/lib/escape";
import { applyIssues, verifyTailorOutput, type Issue } from "./checks";
import {
  TAILOR_PROMPT_ID,
  TAILOR_PROMPT_VERSION,
  TAILOR_SYSTEM,
  buildTailorUser,
  tailorOutputSchema,
  type TailorOutput,
} from "./prompts/v2/tailor";
import { SchemaError, type LLMProvider, type Usage } from "./provider";
import { isFinishedRole, polishBullet } from "./tense";

export interface LedgerEntry {
  roleId: string;
  /** index of this bullet within the role's bullets in the returned resume */
  position: number;
  /** the final text that appears in the resume */
  text: string;
  /** the user's own wording this bullet was derived from (null when derived from the whole role) */
  original: string | null;
  /** why the bullet needs confirmation (empty when verified) */
  reasons: string[];
  /** index of the source bullet in the user's profile, -1 if derived from role context */
  from: number;
  needsMetric: boolean;
  /** "verified" = passed every grounding check; otherwise the UI asks the user to confirm */
  status: "verified" | "needs-confirmation";
}

export interface TailorResult {
  resume: Resume;
  keywords: Keyword[];
  issues: Issue[];
  questions: string[];
  ledger: LedgerEntry[];
  usage: Usage;
  meta: { promptId: string; promptVersion: string; model: string; repaired: boolean };
}

const sumUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

export async function tailorResume(opts: {
  provider: LLMProvider;
  profile: Resume;
  jd: string;
  signal?: AbortSignal;
}): Promise<TailorResult> {
  const { provider, profile, jd, signal } = opts;
  const keywords = extractKeywords(jd);
  const user = buildTailorUser(profile, jd, keywords);
  const base = { system: TAILOR_SYSTEM, schema: tailorOutputSchema, maxTokens: 2500, temperature: 0.3, signal };

  let usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let repaired = false;
  let model = "";
  let output: TailorOutput;

  try {
    const r = await provider.generate({ ...base, user });
    output = r.data;
    usage = sumUsage(usage, r.usage);
    model = r.model;
  } catch (e) {
    if (!(e instanceof SchemaError)) throw e;
    // One cheap repair retry: tell the model what was wrong, don't resend a new task.
    repaired = true;
    const r = await provider.generate({
      ...base,
      user: `${user}\n<error>Your previous output was invalid: ${e.message.slice(0, 400)}. Return corrected JSON only.</error>`,
    });
    output = r.data;
    usage = sumUsage(usage, r.usage);
    model = r.model;
  }

  const issues = verifyTailorOutput({ profile, output, jdKeywords: keywords.map((k) => k.term) });
  const safe = applyIssues(output, issues);
  // Only truthfulness problems make a bullet "needs confirmation"; pure style warnings do not.
  const TRUTH_CODES = new Set(["embellishment", "ungrounded-number", "ungrounded-term", "bad-source", "unknown-id"]);
  const reasons = new Map<string, string[]>();
  for (const i of issues) if (TRUTH_CODES.has(i.code)) reasons.set(i.where, [...(reasons.get(i.where) ?? []), i.message]);

  const ledger: LedgerEntry[] = [];
  const experience = profile.experience.map((role) => {
    const out = safe.experience.find((r) => r.id === role.id);
    // Fall back to the user's own bullets if nothing survived verification.
    if (!out || out.bullets.length === 0) return role;
    const bullets = out.bullets.map((b, position) => {
      const origIdx = output.experience.find((r) => r.id === role.id)!.bullets.indexOf(b);
      const why = reasons.get(`experience[${role.id}].bullets[${origIdx}]`) ?? [];
      const text = polishBullet(asciiPunctuation(b.text), isFinishedRole(role.end));
      ledger.push({
        roleId: role.id,
        position,
        text,
        from: b.from,
        original: b.from >= 0 ? (role.bullets[b.from] ?? null) : null,
        needsMetric: b.needs_metric,
        status: why.length ? "needs-confirmation" : "verified",
        reasons: why,
      });
      return text;
    });
    return { ...role, bullets };
  });

  const skills = safe.skills.filter((g) => g.items.length > 0);
  const resume = resumeSchema.parse({
    ...profile,
    summary: asciiPunctuation(safe.summary || profile.summary),
    skills: skills.length ? skills : profile.skills,
    experience,
  });

  return {
    resume,
    keywords,
    issues,
    questions: output.questions,
    ledger,
    usage,
    meta: { promptId: TAILOR_PROMPT_ID, promptVersion: TAILOR_PROMPT_VERSION, model, repaired },
  };
}
