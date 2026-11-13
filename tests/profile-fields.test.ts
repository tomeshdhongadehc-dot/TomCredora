import { describe, expect, it } from "vitest";
import { CITIES, formatCity, searchCities } from "@/lib/cities";
import { COUNTRIES, countryOfLocation, joinPhone, splitPhone } from "@/lib/countries";
import { hasMiddle, resumeName, withoutMiddle } from "@/lib/name";
import { parseProfile } from "@/lib/profile";

describe("city search", () => {
  it("offers Pune first for 'pu', with its state and country", () => {
    const r = searchCities("pu");
    expect(r[0].city).toBe("Pune");
    expect(formatCity(r[0], true)).toBe("Pune, Maharashtra, India");
    expect(formatCity(r[0], false)).toBe("Pune, India");
  });
  it("ranks names that start with the text before ones that only contain it", () => {
    const names = searchCities("ban").map((c) => c.city);
    expect(names.length).toBeGreaterThan(0);
    expect(searchCities("mum")[0].city).toBe("Mumbai");
  });
  it("finds by state and by country name too", () => {
    expect(searchCities("maha").map((c) => c.city)).toContain("Pune");
    expect(searchCities("singa")[0].city).toBe("Singapore");
  });
  it("ignores accents and case, and uses only the part before a comma (so a picked city still matches)", () => {
    expect(searchCities("PUNE, Maharashtra, India")[0].city).toBe("Pune");
    expect(searchCities("   ")).toEqual([]);
    expect(searchCities("zzzzzz")).toEqual([]);
  });
  it("never returns more than asked", () => {
    expect(searchCities("a", 5).length).toBeLessThanOrEqual(5);
  });
  it("every city has a known country", () => {
    const known = new Set(COUNTRIES.map((c) => c.iso));
    for (const c of CITIES) expect(known.has(c.iso), `${c.city} ${c.iso}`).toBe(true);
  });
});

describe("country and phone", () => {
  it("finds the country at the end of a saved location", () => {
    expect(countryOfLocation("Pune, Maharashtra, India")?.dial).toBe("+91");
    expect(countryOfLocation("Austin, Texas, United States")?.iso).toBe("US");
    expect(countryOfLocation("Somewhere")).toBeUndefined();
    expect(countryOfLocation("")).toBeUndefined();
  });
  it("splits a saved phone into code and number", () => {
    expect(splitPhone("+91 98765 43210")).toEqual({ dial: "+91", number: "98765 43210" });
    expect(splitPhone("+971 50 123 4567")).toEqual({ dial: "+971", number: "50 123 4567" });
    expect(splitPhone("+1 (415) 555-0100")).toEqual({ dial: "+1", number: "(415) 555-0100" });
    expect(splitPhone("98765 43210")).toEqual({ dial: "", number: "98765 43210" });
    expect(splitPhone("")).toEqual({ dial: "", number: "" });
  });
  it("joins them back, and saves nothing for an empty number", () => {
    expect(joinPhone("+91", "98765 43210")).toBe("+91 98765 43210");
    expect(joinPhone("", "98765")).toBe("98765");
    expect(joinPhone("+91", "  ")).toBe("");
  });
  it("round-trips", () => {
    for (const p of ["+91 98765 43210", "+44 7700 900123", "+971 50 123 4567"]) {
      const s = splitPhone(p);
      expect(joinPhone(s.dial, s.number)).toBe(p);
    }
  });
});

describe("middle name", () => {
  it("drops the words between first and last only when there are three or more", () => {
    expect(withoutMiddle("Asha Kumari Rao")).toBe("Asha Rao");
    expect(withoutMiddle("Asha Rao")).toBe("Asha Rao");
    expect(withoutMiddle("Asha")).toBe("Asha");
    expect(withoutMiddle("  Asha   Kumari   Rao ")).toBe("Asha Rao");
  });
  it("knows when there is a middle name", () => {
    expect(hasMiddle("Asha Kumari Rao")).toBe(true);
    expect(hasMiddle("Asha Rao")).toBe(false);
  });
  it("gives the resume name for either choice", () => {
    expect(resumeName("Asha Kumari Rao", true)).toBe("Asha Rao");
    expect(resumeName("Asha Kumari Rao", false)).toBe("Asha Kumari Rao");
  });
  it("is kept in the profile (and survives loading and syncing), and bad values are dropped", () => {
    const p = parseProfile({ focus: "", resume: {}, nameFull: "Asha Kumari Rao", hideMiddle: true });
    expect(p.nameFull).toBe("Asha Kumari Rao");
    expect(p.hideMiddle).toBe(true);
    const q = parseProfile({ focus: "", resume: {}, nameFull: 7, hideMiddle: "yes" });
    expect(q.nameFull).toBeUndefined();
    expect(q.hideMiddle).toBeUndefined();
  });
});

import { MESSAGES, checkAdded, checkEmail, checkLink, checkName, checkPhone, checkUrl, checkYears } from "@/lib/validate";

describe("field checks", () => {
  it("names", () => {
    expect(checkName("")).toBe(MESSAGES.nameEmpty);
    expect(checkName("Asha Rao")).toBe("");
    expect(checkName("Mary-Jane O'Neil Jr.")).toBe("");
    expect(checkName("José Álvarez")).toBe("");
    expect(checkName("Ravi 2")).toBe(MESSAGES.nameChars);
    expect(checkName("A")).toBe(MESSAGES.nameShort);
    expect(checkName("<b>x</b>")).toBe(MESSAGES.nameChars);
  });
  it("emails", () => {
    expect(checkEmail("")).toBe(MESSAGES.emailEmpty);
    expect(checkEmail("asha@example.com")).toBe("");
    expect(checkEmail("asha.rao+jobs@mail.example.co.in")).toBe("");
    for (const bad of ["asha", "asha@", "@example.com", "asha@example", "asha @example.com", "asha@example..com", "a@b@c.com"]) expect(checkEmail(bad), bad).toBe(MESSAGES.email);
  });
  it("phone numbers: optional; 10 digits for India; 7 to 15 elsewhere", () => {
    expect(checkPhone("", "+91")).toBe("");
    expect(checkPhone("98765 43210", "+91")).toBe("");
    expect(checkPhone("98765 4321", "+91")).toBe(MESSAGES.phoneIndia);
    expect(checkPhone("7700 900123", "+44")).toBe("");
    expect(checkPhone("123", "+44")).toBe(MESSAGES.phoneDigits);
    expect(checkPhone("1".repeat(16), "")).toBe(MESSAGES.phoneDigits);
    expect(checkPhone("(415) 555-0100", "+1")).toBe("");
  });
  it("web addresses", () => {
    expect(checkUrl("")).toBe("");
    expect(checkUrl("", true)).toBe(MESSAGES.linkAddress);
    expect(checkUrl("https://example.com/a?b=1")).toBe("");
    for (const bad of ["example", "www.example.com", "javascript:alert(1)", "ftp://example.com", "https://localhost", "https://"]) expect(checkUrl(bad), bad).toBe(MESSAGES.url);
  });
  it("named links must belong to that site", () => {
    expect(checkLink("LinkedIn", "https://www.linkedin.com/in/asha")).toBe("");
    expect(checkLink("LinkedIn", "https://example.com/asha")).toMatch(/LinkedIn/);
    expect(checkLink("GitHub", "https://github.com/asha")).toBe("");
    expect(checkLink("GitHub", "https://gitlab.com/asha")).toMatch(/GitHub/);
    expect(checkLink("Portfolio", "https://asha.dev")).toBe("");
    expect(checkLink("LinkedIn", "")).toBe("");
  });
  it("years and added items", () => {
    expect(checkYears("2020", "2022")).toBe("");
    expect(checkYears("2022", "2020")).toMatch(/before the first year/);
    expect(checkYears("", "2020")).toBe("");
    expect(checkAdded("a", [])).toBe(MESSAGES.skillShort);
    expect(checkAdded("React", ["react"])).toBe(MESSAGES.skillDuplicate);
    expect(checkAdded("Vue", ["React"])).toBe("");
  });
});
