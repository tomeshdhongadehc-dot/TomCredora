/**
 * Checks for the profile fields. Each returns "" when the value is fine, or a short plain-language message that says
 * what is wrong and how to fix it. They never block typing or saving: the profile can be unfinished while it is
 * being filled in, so these only guide.
 */

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

export const MESSAGES = {
  nameEmpty: "Enter your full name, the way it should appear at the top of your resume.",
  nameShort: "Add your first and last name.",
  nameChars: "Use letters only in your name, for example Asha Rao. Numbers and symbols are not needed.",
  emailEmpty: "Enter your email address so employers can reach you.",
  email: "That does not look like an email address. It should look like name@example.com.",
  phoneDigits: "A phone number has 7 to 15 digits. Check that none is missing or extra.",
  phoneIndia: "An Indian mobile number has 10 digits. Check the number, and do not type the +91 again.",
  url: "Enter the full address, starting with https://, for example https://example.com.",
  linkName: "Give this link a name, like LinkedIn or Portfolio.",
  linkAddress: "Add the address for this link, or remove it.",
  roleTitle: "Enter your job title.",
  company: "Enter the company or organisation.",
  city: "Add the city this job was in.",
  start: "Pick the month and year you started.",
  end: "Pick the month and year you finished, or tick \"I work here now\".",
  school: "Enter your school or college.",
  degree: "Choose or type your degree.",
  projectName: "Give this project a name.",
  skillShort: "Type at least 2 characters.",
  skillDuplicate: "You already added that one.",
} as const;

export function checkName(v: string): string {
  const t = v.trim();
  if (!t) return MESSAGES.nameEmpty;
  if (!NAME_CHARS.test(t)) return MESSAGES.nameChars;
  if (t.replace(/[^\p{L}]/gu, "").length < 2) return MESSAGES.nameShort;
  return "";
}

export function checkEmail(v: string): string {
  const t = v.trim();
  if (!t) return MESSAGES.emailEmpty;
  return t.length <= 120 && EMAIL.test(t) ? "" : MESSAGES.email;
}

/** The number part only (the country code is chosen separately). Empty is fine: a phone is optional. */
export function checkPhone(number: string, dial: string): string {
  const digits = number.replace(/\D/g, "");
  if (!digits) return "";
  if (dial === "+91") return digits.length === 10 ? "" : MESSAGES.phoneIndia;
  return digits.length >= 7 && digits.length <= 15 ? "" : MESSAGES.phoneDigits;
}

/** A web address, optional unless `required`. Only http and https are accepted. */
export function checkUrl(v: string, required = false): string {
  const t = v.trim();
  if (!t) return required ? MESSAGES.linkAddress : "";
  try {
    const u = new URL(t);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") ? "" : MESSAGES.url;
  } catch {
    return MESSAGES.url;
  }
}

/** A named link such as LinkedIn: the address must belong to that site. */
export function checkLink(label: string, url: string): string {
  const bad = checkUrl(url);
  if (bad) return bad;
  const t = url.trim();
  if (!t) return "";
  const host = new URL(t).hostname.toLowerCase();
  const l = label.trim().toLowerCase();
  if (l === "linkedin" && !(host === "linkedin.com" || host.endsWith(".linkedin.com"))) return "This does not look like a LinkedIn address. It should start with https://linkedin.com/in/.";
  if (l === "github" && !(host === "github.com" || host.endsWith(".github.com"))) return "This does not look like a GitHub address. It should start with https://github.com/.";
  return "";
}

/** "2023" style years: the last must not be before the first. */
export const checkYears = (start: string, end: string): string => (start && end && Number(end) < Number(start) ? "The last year is before the first year. Please check them." : "");

/** A skill, certification or point someone adds by hand. */
export function checkAdded(text: string, existing: readonly string[]): string {
  const t = text.trim();
  if (t.length < 2) return MESSAGES.skillShort;
  return existing.some((e) => e.toLowerCase() === t.toLowerCase()) ? MESSAGES.skillDuplicate : "";
}
