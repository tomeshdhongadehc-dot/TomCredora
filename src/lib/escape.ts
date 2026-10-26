/** Escape user text for HTML contexts (belt and braces; React already escapes). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const LATEX_MAP: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  $: "\\$",
  "&": "\\&",
  "#": "\\#",
  "%": "\\%",
  _: "\\_",
  "^": "\\textasciicircum{}",
  "~": "\\textasciitilde{}",
};

/**
 * Escape user text for LaTeX. Single pass over characters so output of one
 * replacement is never re-escaped; neutralises \input, \write18 etc. because
 * the backslash itself becomes \textbackslash{}.
 */
export function escapeLatex(s: string): string {
  return s.replace(/[\\{}$&#%_^~]/g, (c) => LATEX_MAP[c]);
}

/** Symbols pdfLaTeX (T1 + utf8) cannot typeset, mapped to safe LaTeX or plain text. */
const LATEX_SYMBOLS: Record<string, string> = {
  "₹": "Rs.\\,", // rupee sign
  "€": "\\texteuro{}",
  "→": "->",
  "←": "<-",
  "⇒": "=>",
  "≥": ">=",
  "≤": "<=",
  "≈": "\\textasciitilde{}",
  "≠": "!=",
  "™": "\\texttrademark{}",
  "✓": "",
  "✔": "",
};

/**
 * Text for LaTeX body content. Escapes specials AND guarantees the output compiles under pdfLaTeX:
 * known symbols are transliterated; Latin letters (ASCII, Latin-1, Latin Extended-A) pass through;
 * other letters become "?" (visible, instead of a fatal "Unicode character not set up" error);
 * emoji, invisible and control characters are dropped.
 */
export function latexText(s: string): string {
  let out = "";
  for (const ch of asciiPunctuation(s).replace(/\s+/g, " ")) {
    if (ch in LATEX_SYMBOLS) out += LATEX_SYMBOLS[ch];
    else if (/[ -~ -ſ]/.test(ch) && ch !== "­") out += escapeLatex(ch);
    else if (/\p{L}/u.test(ch)) out += "?";
  }
  // dropped characters (emoji etc.) can leave doubled spaces behind
  return out.replace(/ {2,}/g, " ").trim();
}

/** Normalise typographic punctuation to ASCII so ATS parsers don't mangle it. */
export function asciiPunctuation(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•●▪]/g, "-")
    .replace(/ /g, " ");
}
