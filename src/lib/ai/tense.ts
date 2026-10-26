/**
 * Deterministic bullet polish applied after the model responds. Models regularly use present tense for
 * jobs that ended years ago ("Automate deployment pipelines"), which reads as a mistake to a recruiter.
 * We only rewrite a lead verb when it is a KNOWN base-form resume verb, so unknown words are never touched.
 */

const IRREGULAR: Record<string, string> = {
  build: "built", lead: "led", run: "ran", write: "wrote", drive: "drove", grow: "grew", win: "won", make: "made",
  take: "took", set: "set", spend: "spent", teach: "taught", send: "sent", hold: "held", begin: "began",
  bring: "brought", choose: "chose", draw: "drew", give: "gave", find: "found", get: "got", keep: "kept",
  meet: "met", pay: "paid", put: "put", sell: "sold", speak: "spoke", understand: "understood", cut: "cut",
  rebuild: "rebuilt", undertake: "undertook", oversee: "oversaw", overhaul: "overhauled",
};

/** Regular verbs that double their final consonant. */
const DOUBLING = new Set(["ship", "plan", "map", "stop", "drop", "scan", "wrap", "refer", "submit", "commit", "transfer", "program", "grab", "prep"]);

const REGULAR = [
  "automate", "migrate", "enhance", "mentor", "develop", "design", "implement", "improve", "optimize", "reduce",
  "increase", "manage", "create", "collaborate", "coordinate", "establish", "analyze", "architect", "integrate",
  "deploy", "launch", "maintain", "monitor", "streamline", "spearhead", "define", "execute", "facilitate",
  "generate", "identify", "introduce", "partner", "refactor", "resolve", "secure", "standardize", "support",
  "test", "train", "upgrade", "validate", "own", "evaluate", "leverage", "document", "configure", "administer",
  "advise", "assist", "engineer", "orchestrate", "pioneer", "produce", "prototype", "recruit", "redesign",
  "research", "review", "scale", "simplify", "supervise", "transform", "troubleshoot", "unify", "utilize",
  "deliver", "achieve", "accelerate", "audit", "boost", "debug", "decrease", "demonstrate",
  "direct", "drive", "enable", "ensure", "expand", "guide", "handle", "initiate", "innovate",
  "install", "investigate", "maximize", "modernize", "negotiate", "organize", "outline", "perform", "plan",
  "present", "promote", "provide", "publish", "reorganize", "replace", "report", "represent", "restructure",
  "revamp", "ship", "solve", "source", "staff", "strengthen", "structure", "tailor", "track", "translate",
  "apply", "verify", "write",
].filter((v) => !(v in IRREGULAR));

/** Words that are also common nouns: only treated as a verb when followed by a determiner/number ("Lead a team", not "Lead developer"). */
const AMBIGUOUS = new Set(["lead", "test", "plan", "support", "report", "present", "source", "staff", "scale", "track", "design", "document", "review", "research", "audit", "structure", "guide", "own", "set", "cut", "ship", "map", "drive", "run", "present", "handle", "direct", "produce", "model", "program", "tailor", "pioneer", "engineer", "partner", "mentor"]);
const VERB_FOLLOWERS = /^(a|an|the|all|each|every|multiple|several|my|our|their|its|over|across|\d+|cross-functional|end-to-end|and)$/i;

export function toPast(base: string): string | null {
  const v = base.toLowerCase();
  if (IRREGULAR[v]) return IRREGULAR[v];
  if (!REGULAR.includes(v)) return null;
  if (DOUBLING.has(v)) return v + v.slice(-1) + "ed";
  if (v.endsWith("e")) return v + "d";
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + "ied";
  return v + "ed";
}

/** "Automate deployment..." -> "Automated deployment...". Unknown or already-past lead words are returned unchanged. */
export function pastTenseLead(bullet: string): string {
  const m = /^([A-Za-z]+)(\b[\s\S]*)$/.exec(bullet);
  if (!m) return bullet;
  const past = toPast(m[1]);
  if (!past) return bullet;
  if (AMBIGUOUS.has(m[1].toLowerCase())) {
    const next = /^\s+([^\s]+)/.exec(m[2])?.[1] ?? "";
    if (!VERB_FOLLOWERS.test(next)) return bullet;
  }
  const cased = m[1][0] === m[1][0].toUpperCase() ? past[0].toUpperCase() + past.slice(1) : past;
  return cased + m[2];
}

/** A role is finished when it has an end date that is not "Present"/"Current"/"Now". */
export const isFinishedRole = (end: string) => end.trim().length > 0 && !/^(present|current|now|ongoing|till date|to date)$/i.test(end.trim());

/** Final polish for a bullet: drop the trailing period (resume convention) and fix tense for finished roles. */
export function polishBullet(text: string, finished: boolean): string {
  const trimmed = text.trim().replace(/[.\s]+$/, "");
  return finished ? pastTenseLead(trimmed) : trimmed;
}
