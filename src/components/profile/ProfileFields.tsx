"use client";

import { useState } from "react";
import type { City } from "@/lib/cities";
import { COUNTRIES, countryByIso, joinPhone, splitPhone } from "@/lib/countries";
import { Combobox, type Option } from "./Combobox";

const fieldClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-2/60 transition-colors hover:border-ink-2/50 focus:border-accent";

type CitiesModule = typeof import("@/lib/cities");
let cached: CitiesModule | null = null;

/**
 * A city box that suggests places as you type ("pu" offers Pune, Maharashtra, India). The list is loaded the first
 * time the box is used. You can still type any place that is not in the list.
 */
export function CityField({ id, value, onChange, withRegion, required, invalid, placeholder }: { id: string; value: string; onChange: (text: string) => void; withRegion: boolean; required?: boolean; invalid?: boolean; placeholder?: string }) {
  const [mod, setMod] = useState<CitiesModule | null>(cached);
  const load = () => {
    if (cached) return setMod(cached);
    void import("@/lib/cities").then((m) => {
      cached = m;
      setMod(m);
    });
  };
  const options: Option[] = mod
    ? mod.searchCities(value).map((c: City) => ({
        value: mod.formatCity(c, withRegion),
        label: c.city,
        detail: [c.region, countryByIso(c.iso)?.name].filter(Boolean).join(", "),
      }))
    : [];
  // once a suggestion has been picked the list has nothing more to say
  const shown = options.length === 1 && options[0].value === value ? [] : options;
  return <Combobox id={id} value={value} onChange={onChange} options={shown} onFocusOpen={load} maxLength={80} autoComplete="off" required={required} invalid={invalid} placeholder={placeholder ?? "Start typing, e.g. Pune"} listLabel="Places" />;
}

const isoOfDial = (dial: string) => COUNTRIES.find((c) => c.dial === dial)?.iso ?? "";
const cleanNumber = (v: string) => v.replace(/[^\d\s().+-]/g, "").replace(/(?!^)\+/g, "");

/**
 * Country code and number, side by side. The code is chosen from a list, and follows the country of the city you
 * picked until you choose one yourself. The saved phone reads like "+91 98765 43210".
 */
export function PhoneField({ id, value, onChange, suggestIso }: { id: string; value: string; onChange: (phone: string) => void; suggestIso: string }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const parsed = splitPhone(value);
  const parsedIso = parsed.dial ? (chosen && countryByIso(chosen)?.dial === parsed.dial ? chosen : isoOfDial(parsed.dial)) : "";
  const iso = parsedIso || chosen || suggestIso || "";
  const dial = countryByIso(iso)?.dial ?? "";

  return (
    <div className="flex gap-2">
      <select
        aria-label="Country code"
        value={iso}
        onChange={(e) => {
          const next = e.target.value;
          setChosen(next);
          if (parsed.number) onChange(joinPhone(countryByIso(next)?.dial ?? "", parsed.number));
        }}
        className={`${fieldClass.replace("w-full ", "")} w-[8.5rem] shrink-0 sm:w-44`}
      >
        <option value="">Code</option>
        {COUNTRIES.map((c) => (
          <option key={c.iso} value={c.iso}>{`${c.name} (${c.dial})`}</option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-describedby={`${id}-hint`}
        value={parsed.number}
        placeholder="98765 43210"
        className={`${fieldClass.replace("w-full ", "")} min-w-0 flex-1`}
        onChange={(e) => {
          const raw = cleanNumber(e.target.value).slice(0, 20); // capped here: a maxLength attribute misbehaves with touch typing
          if (raw.startsWith("+")) {
            // a number pasted with its code: use the code
            const s = splitPhone(raw);
            if (s.dial) setChosen(isoOfDial(s.dial));
            return onChange(joinPhone(s.dial, s.number));
          }
          onChange(joinPhone(dial, raw));
        }}
      />
      <span id={`${id}-hint`} className="sr-only">Choose the country code, then type the number without it.</span>
    </div>
  );
}
