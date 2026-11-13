/**
 * Pull the job posting out of a web page. Most job sites describe the posting in a machine-readable block
 * (schema.org JobPosting) for search engines; that is used when present. Otherwise the readable text of the page
 * is used. Pure string work: nothing from the page is run, rendered or trusted.
 */

export interface JobPage {
  title: string;
  company: string;
  text: string;
  via: "structured" | "page";
}

export const MAX_JOB_TEXT = 12_000;

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", bull: "•", middot: "·",
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: "...", copy: "©", reg: "®", trade: "™", eacute: "é",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d{1,7});/g, (_, n: string) => (Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : " "))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n: string) => (parseInt(n, 16) <= 0x10ffff ? String.fromCodePoint(parseInt(n, 16)) : " "))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED[name.toLowerCase()] ?? m);
}

/** HTML to readable text: block elements become line breaks, list items become bullets, everything else is dropped. */
export function htmlToText(html: string): string {
  const s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer|form|button|select)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|ul|ol|table|tr|h[1-6]|blockquote|dl|dt|dd)\s*>/gi, "\n")
    .replace(/<(p|div|section|article|h[1-6]|tr|ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(s)
    .replace(/[   ]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const WALL = /(sign in to (?:continue|view)|log ?in to (?:continue|view)|verify you are (?:a )?human|are you a robot|enable javascript|javascript is (?:disabled|required)|access denied|captcha|checking your browser|please wait while)/i;

const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

function* walk(node: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 6 || !node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node.slice(0, 50)) yield* walk(n, depth + 1);
    return;
  }
  const o = node as Record<string, unknown>;
  yield o;
  if (o["@graph"]) yield* walk(o["@graph"], depth + 1);
}

function fromJsonLd(html: string): JobPage | null {
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const o of walk(data)) {
      const type = o["@type"];
      if (!(type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting")))) continue;
      const title = str(o.title, 100) || str(o.name, 100);
      const org = o.hiringOrganization;
      const company = typeof org === "string" ? str(org, 100) : str((org as Record<string, unknown> | undefined)?.name, 100);
      const loc = Array.isArray(o.jobLocation) ? o.jobLocation[0] : o.jobLocation;
      const addr = (loc as Record<string, unknown> | undefined)?.address as Record<string, unknown> | undefined;
      const place = [str(addr?.addressLocality, 60), str(addr?.addressRegion, 60), str(addr?.addressCountry, 60)].filter(Boolean).join(", ");
      const part = (v: unknown) => (typeof v === "string" ? htmlToText(decodeEntities(v)) : "");
      const body = [part(o.description), part(o.responsibilities), part(o.qualifications), part(o.skills)].filter(Boolean).join("\n\n");
      if (body.length < 80) continue;
      const head = [title, [company, place].filter(Boolean).join(" - ")].filter(Boolean).join("\n");
      return { title, company, text: `${head}\n\n${body}`.slice(0, MAX_JOB_TEXT).trim(), via: "structured" };
    }
  }
  return null;
}

function metaTitle(html: string): string {
  const og = html.match(/<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']*)["']/i) ?? html.match(/<meta\b[^>]*content\s*=\s*["']([^"']*)["'][^>]*property\s*=\s*["']og:title["']/i);
  const t = og?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return decodeEntities(t).replace(/\s+/g, " ").trim().slice(0, 100);
}

/** The posting from a page, or null when the page does not contain one (login walls, empty app shells). */
export function extractJob(html: string): JobPage | null {
  const structured = fromJsonLd(html);
  if (structured) return structured;
  const main = html.match(/<(main|article)\b[\s\S]*?<\/\1\s*>/i)?.[0];
  const mainText = main ? htmlToText(main) : "";
  const text = (mainText.length > 400 ? mainText : htmlToText(html.replace(/<head\b[\s\S]*?<\/head\s*>/i, " "))).slice(0, MAX_JOB_TEXT);
  if (text.length < 250 || (WALL.test(text) && text.length < 1500)) return null;
  return { title: metaTitle(html), company: "", text, via: "page" };
}
