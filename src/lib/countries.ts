/** Countries with their phone dialling codes. Small on purpose: it is loaded with the profile page. */
export interface Country {
  /** ISO 3166-1 alpha-2 */
  iso: string;
  name: string;
  /** with the plus sign, e.g. "+91" */
  dial: string;
}

export const COUNTRIES: readonly Country[] = [
  { iso: "IN", name: "India", dial: "+91" },
  { iso: "US", name: "United States", dial: "+1" },
  { iso: "GB", name: "United Kingdom", dial: "+44" },
  { iso: "CA", name: "Canada", dial: "+1" },
  { iso: "AU", name: "Australia", dial: "+61" },
  { iso: "AE", name: "United Arab Emirates", dial: "+971" },
  { iso: "SG", name: "Singapore", dial: "+65" },
  { iso: "DE", name: "Germany", dial: "+49" },
  { iso: "FR", name: "France", dial: "+33" },
  { iso: "NL", name: "Netherlands", dial: "+31" },
  { iso: "IE", name: "Ireland", dial: "+353" },
  { iso: "ES", name: "Spain", dial: "+34" },
  { iso: "IT", name: "Italy", dial: "+39" },
  { iso: "SE", name: "Sweden", dial: "+46" },
  { iso: "CH", name: "Switzerland", dial: "+41" },
  { iso: "JP", name: "Japan", dial: "+81" },
  { iso: "CN", name: "China", dial: "+86" },
  { iso: "HK", name: "Hong Kong", dial: "+852" },
  { iso: "KR", name: "South Korea", dial: "+82" },
  { iso: "MY", name: "Malaysia", dial: "+60" },
  { iso: "ID", name: "Indonesia", dial: "+62" },
  { iso: "TH", name: "Thailand", dial: "+66" },
  { iso: "PH", name: "Philippines", dial: "+63" },
  { iso: "VN", name: "Vietnam", dial: "+84" },
  { iso: "PK", name: "Pakistan", dial: "+92" },
  { iso: "BD", name: "Bangladesh", dial: "+880" },
  { iso: "LK", name: "Sri Lanka", dial: "+94" },
  { iso: "NP", name: "Nepal", dial: "+977" },
  { iso: "SA", name: "Saudi Arabia", dial: "+966" },
  { iso: "QA", name: "Qatar", dial: "+974" },
  { iso: "KW", name: "Kuwait", dial: "+965" },
  { iso: "OM", name: "Oman", dial: "+968" },
  { iso: "BH", name: "Bahrain", dial: "+973" },
  { iso: "ZA", name: "South Africa", dial: "+27" },
  { iso: "NG", name: "Nigeria", dial: "+234" },
  { iso: "KE", name: "Kenya", dial: "+254" },
  { iso: "EG", name: "Egypt", dial: "+20" },
  { iso: "BR", name: "Brazil", dial: "+55" },
  { iso: "MX", name: "Mexico", dial: "+52" },
  { iso: "AR", name: "Argentina", dial: "+54" },
  { iso: "CO", name: "Colombia", dial: "+57" },
  { iso: "CL", name: "Chile", dial: "+56" },
  { iso: "NZ", name: "New Zealand", dial: "+64" },
  { iso: "RU", name: "Russia", dial: "+7" },
  { iso: "TR", name: "Turkey", dial: "+90" },
  { iso: "PL", name: "Poland", dial: "+48" },
  { iso: "PT", name: "Portugal", dial: "+351" },
  { iso: "NO", name: "Norway", dial: "+47" },
  { iso: "DK", name: "Denmark", dial: "+45" },
  { iso: "FI", name: "Finland", dial: "+358" },
  { iso: "BE", name: "Belgium", dial: "+32" },
  { iso: "AT", name: "Austria", dial: "+43" },
  { iso: "IL", name: "Israel", dial: "+972" },
  { iso: "UA", name: "Ukraine", dial: "+380" },
];

export const countryByIso = (iso: string): Country | undefined => COUNTRIES.find((c) => c.iso === iso.toUpperCase());

/** "India" -> the country, matching on the name (as written in a saved location). */
export const countryByName = (name: string): Country | undefined => {
  const n = name.trim().toLowerCase();
  return COUNTRIES.find((c) => c.name.toLowerCase() === n || (n === "uk" && c.iso === "GB") || (n === "usa" && c.iso === "US") || (n === "uae" && c.iso === "AE"));
};

/** The country a saved location ends with, e.g. "Pune, Maharashtra, India" -> India. */
export function countryOfLocation(location: string): Country | undefined {
  const last = location.split(",").pop() ?? "";
  return countryByName(last);
}

/** Split "+91 98765 43210" into its dial code and the number. A number without a code keeps an empty dial. */
export function splitPhone(phone: string): { dial: string; number: string } {
  // only the start is trimmed: a space typed at the end is the person still typing, and must stay
  const p = phone.replace(/^\s+/, "");
  if (!p.startsWith("+")) return { dial: "", number: p };
  const digits = p.slice(1).replace(/[^\d]/g, "");
  // longest matching code first (+971 before +97, +1 last)
  const codes = [...new Set(COUNTRIES.map((c) => c.dial))].sort((a, b) => b.length - a.length);
  const hit = codes.find((d) => digits.startsWith(d.slice(1)));
  if (!hit) return { dial: "", number: p };
  // keep the number as the person typed it: drop the code digits only
  let seen = 0;
  let i = 1;
  while (i < p.length && seen < hit.length - 1) {
    if (/\d/.test(p[i])) seen++;
    i++;
  }
  return { dial: hit, number: p.slice(i).replace(/^[\s.-]+/, "") };
}

export const joinPhone = (dial: string, number: string): string => {
  if (!number.trim()) return "";
  const n = number.replace(/^\s+/, "");
  return dial ? `${dial} ${n}` : n;
};
