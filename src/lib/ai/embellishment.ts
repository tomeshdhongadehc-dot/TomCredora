import { toPast } from "./tense";

/**
 * Detects the subtle fabrication that number/tech grounding cannot see: a model "polishing" a bullet by adding
 * activities, scope, qualities or OUTCOMES the user never stated ("optimizing component architecture", "active users",
 * "to maintain application stability"). We compare the bullet's content words with the user's own source text.
 * It is a heuristic by design: results are shown to the user as "please confirm", never silently dropped.
 */

const STOP = new Set(
  ("a an the and or but of to in on for with at by from as is are was were be been being this that these those it its their " +
    "our your into over under about across per via within without while which who whom where when than then so such not no " +
    "more most other all any each both up out off using use used new also over").split(" "),
);

// Generic words that are fine to introduce when rewording (glue, scale words, and domain-neutral nouns).
const GLUE = new Set(
  ("team teams work worked working project projects product products result results impact improve improved improving " +
    "increase increased reduce reduced multiple several key company customer customers user users client clients business " +
    "system systems feature features tool tools process processes support supported ensure ensured help helped " +
    "software application applications data database databases production code codebase platform platforms service services " +
    "finance financial department organization organisation stakeholders internal external existing percent percentage").split(" "),
);

const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Very light stemmer: enough to treat dashboard/dashboards and optimize/optimizing/optimized as one word. */
export function stem(w: string): string {
  let s = w;
  if (s.length > 4) s = s.replace(/(ations|ation|ings|ing|ied|ies|ed|es|s|ly)$/, "");
  if (s.length > 4) s = s.replace(/(e|y)$/, "");
  return s;
}

/** Candidate base forms of an inflected word: resolved->resolve, shipped->ship, cutting->cut, coordinates->coordinate. */
function baseForms(w: string): string[] {
  const out = [w];
  const strip = (suffix: string, add = "") => {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      const b = w.slice(0, -suffix.length) + add;
      out.push(b);
      if (/(.)\1$/.test(b)) out.push(b.slice(0, -1)); // doubled consonant: shipped -> shipp -> ship
    }
  };
  strip("s");
  strip("es");
  strip("ed");
  strip("ed", "e");
  strip("d");
  strip("ing");
  strip("ing", "e");
  strip("ied", "y");
  strip("ies", "y");
  return out;
}

/** True for base or inflected forms of known resume verbs (a reworded verb is expected, not embellishment). */
export function isVerbForm(w: string): boolean {
  return baseForms(w).some((b) => toPast(b) !== null) || EXTRA_VERBS.has(w);
}
const EXTRA_VERBS = new Set(["author", "authored", "collaborate", "collaborated", "coordinate", "coordinated", "resolve", "resolved", "assist", "assisted"]);

function contentWords(s: string): string[] {
  return norm(s)
    .split(/[\s-]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !GLUE.has(w) && !/^\d/.test(w) && !isVerbForm(w));
}

/**
 * Where an outcome/method/purpose clause starts ("... to improve X", "... by doing Y", "... resulting in Z").
 * "to" only counts when a verb follows (so "migrated to TypeScript" is not treated as a purpose clause).
 */
function clauseTail(bullet: string): string | null {
  const text = norm(bullet);
  const re = /\b(to|by|resulting in|ensuring|enabling|thereby|so that)\s+(\S+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[1] === "to" && !isVerbForm(m[2])) continue;
    return text.slice(m.index + m[1].length);
  }
  return null;
}

export interface Embellishment {
  /** content words in the bullet that appear nowhere in the allowed source text */
  novel: string[];
  total: number;
  flagged: boolean;
}

/**
 * @param bullet   the AI's bullet text
 * @param sources  everything the AI may legitimately draw from: the source bullet, role title, company, the user's own skills
 */
export function checkEmbellishment(bullet: string, sources: string[]): Embellishment {
  const allowed = new Set(contentWords(sources.join(" ")).map(stem));
  const isNovel = (w: string) => !allowed.has(stem(w));
  const words = contentWords(bullet);
  const novel = words.filter(isNovel);

  // 1) Lots of new vocabulary overall.
  const widespread = novel.length >= 3 && novel.length / Math.max(1, words.length) >= 0.5;
  // 2) An invented purpose/outcome/method clause: any new content word after "to <verb>", "by", "resulting in"...
  const tail = clauseTail(bullet);
  const tailNovel = tail ? contentWords(tail).filter(isNovel) : [];

  return { novel: [...new Set([...novel, ...tailNovel])], total: words.length, flagged: widespread || tailNovel.length >= 1 };
}
