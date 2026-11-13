"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { DEGREES, FAMILIES, MONTHS, familyById, formatDate, parseDate, yearsFrom, type Family } from "@/lib/catalog";
import { newId } from "@/lib/draft-model";
import { getStorage } from "@/lib/draft";
import { completeness, profileFromResume, profileHasContent, type Profile } from "@/lib/profile";
import { SAMPLE_RESUME } from "@/lib/sample";
import { countryOfLocation, splitPhone } from "@/lib/countries";
import { MESSAGES, checkAdded, checkEmail, checkLink, checkName, checkPhone, checkUrl, checkYears } from "@/lib/validate";
import { hasMiddle, resumeName, withoutMiddle } from "@/lib/name";
import { usePersistedText } from "@/lib/use-persisted-text";
import { useProfile } from "@/lib/use-profile";
import { loadWorkspace } from "@/lib/workspace";
import { hasContent } from "@/lib/draft-model";
import type { Resume } from "@/lib/schema";
import { AccountMenu } from "../account/AccountMenu";
import { SaveNudge } from "../account/SaveNudge";
import { Button, Card } from "../ui";
import { Combobox } from "./Combobox";
import { CityField, PhoneField } from "./ProfileFields";

const ImportResume = dynamic(() => import("./ImportResume").then((m) => m.ImportResume), {
  loading: () => <div role="status" className="h-32 animate-pulse rounded-2xl bg-surface-2" aria-label="Loading" />,
});

type Exp = Resume["experience"][number];
type Edu = Resume["education"][number];

const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-2/60 transition-colors hover:border-ink-2/50 focus:border-accent";
const LINK_HINT: Record<string, string> = { linkedin: "https://linkedin.com/in/your-name", github: "https://github.com/your-name", portfolio: "https://your-site.com" };
/** Most skills a resume can sensibly carry: past this, the list stops being read. */
const MAX_SKILLS = 30;
const THIS_YEAR = new Date().getFullYear();
const YEARS = yearsFrom(THIS_YEAR);

/** A tap-to-toggle choice. */
function Pick({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors duration-[var(--dur-fast)] disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink hover:border-ink-2/60 hover:bg-surface-2"}`}
    >
      {on && <span aria-hidden>✓ </span>}
      {children}
    </button>
  );
}

/** Remember that a field has been left, so a message does not appear while the first letters are still being typed. */
function useTouched() {
  const [touched, setTouched] = useState(false);
  return [touched, { onBlurCapture: () => setTouched(true) }] as const;
}

/**
 * A label, the control, a tooltip (`tip`, shown on hover and read out) and one line of help. A problem (`error`) is shown
 * under the field once it has been left, or at once with `showNow`, and the field is marked invalid for screen readers.
 */
function Labelled({ label, children, hint, required, error, tip, showNow }: { label: string; children: (id: string) => ReactNode; hint?: string; required?: boolean; error?: string; tip?: string; showNow?: boolean }) {
  const id = useId();
  const [touched, touch] = useTouched();
  const showErr = !!error && (touched || !!showNow);
  const msgId = `${id}-msg`;
  const message = showErr ? error : hint;
  // the control is built by the caller, so the shared bits are applied to it here
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    if (showErr) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
    if (message) el.setAttribute("aria-describedby", msgId);
    else el.removeAttribute("aria-describedby");
    if (tip) el.setAttribute("title", tip);
  });
  return (
    <div className="space-y-1" {...touch}>
      <div className="flex items-baseline gap-1">
        <label htmlFor={id} className="block text-xs font-medium text-ink-2" title={tip}>{label}</label>
        {required && <span aria-hidden className="text-xs text-bad">*</span>}
      </div>
      {children(id)}
      <div aria-live="polite">
        {message && (
          <p id={msgId} className={`text-xs ${showErr ? "text-bad" : "text-ink-2"}`}>
            {showErr && <span aria-hidden>⚠ </span>}
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

/** Month and year as a number to compare, 0 when not filled in. */
const monthsOf = (d: string) => {
  const { month, year } = parseDate(d);
  return year ? Number(year) * 12 + Math.max(MONTHS.indexOf(month as (typeof MONTHS)[number]), 0) : 0;
};

/** One line to add your own item (Enter or the button). */
function AddOwn({ label, placeholder, onAdd, persistKey, disabled, existing = [] }: { label: string; placeholder: string; onAdd: (v: string) => void; persistKey: string; disabled?: boolean; existing?: readonly string[] }) {
  const [v, setV] = usePersistedText(persistKey);
  const [problem, setProblem] = useState("");
  const id = useId();
  const submit = () => {
    const t = v.trim();
    if (!t) return;
    const bad = checkAdded(t, existing);
    if (bad) return setProblem(bad);
    setProblem("");
    onAdd(t);
    setV("");
  };
  return (
    <div>
    <div className="flex gap-2">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} value={v} aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${id}-problem` : undefined} onChange={(e) => { setV(e.target.value); setProblem(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} placeholder={placeholder} maxLength={120} disabled={disabled} className={`${field} disabled:opacity-60`} />
      <Button type="button" variant="ghost" onClick={submit} disabled={disabled || !v.trim()} aria-label={`Add: ${label}`}>Add</Button>
    </div>
    <div aria-live="polite">{problem && <p id={`${id}-problem`} className="mt-1 text-xs text-bad"><span aria-hidden>⚠ </span>{problem}</p>}</div>
    </div>
  );
}

/** A comma-separated list that is saved on every keystroke (not only on blur, which Back never triggers). The raw text is kept so typing "React, " does not lose the comma. */
function TechField({ id, tech, onChange }: { id: string; tech: string[]; onChange: (t: string[]) => void }) {
  const [raw, setRaw] = useState(tech.join(", "));
  return (
    <input
      id={id}
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 15));
      }}
      placeholder="React, Node.js"
      className={field}
    />
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="font-display text-xl">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-2">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function DateSelects({ label, value, onChange, invalid }: { label: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const { month, year } = parseDate(value);
  return (
    <div className="flex gap-2">
      <select aria-label={`${label} month`} aria-invalid={invalid && !month ? true : undefined} title="The month" value={month} onChange={(e) => onChange(formatDate(e.target.value, year))} className={field}>
        <option value="">Month</option>
        {MONTHS.map((m) => <option key={m}>{m}</option>)}
      </select>
      <select aria-label={`${label} year`} aria-invalid={invalid && !year ? true : undefined} title="The year" value={year} onChange={(e) => onChange(formatDate(month, e.target.value))} className={field}>
        <option value="">Year</option>
        {YEARS.map((y) => <option key={y}>{y}</option>)}
      </select>
    </div>
  );
}

/** One link: its name and address, with a message under it when the address is not usable. */
function LinkRow({ n, link, onChange, onRemove }: { n: number; link: { label: string; url: string }; onChange: (l: { label: string; url: string }) => void; onRemove: () => void }) {
  const [seen, touch] = useTouched();
  const id = useId();
  const urlProblem = link.url.trim() ? checkLink(link.label, link.url) : seen ? MESSAGES.linkAddress : "";
  const nameProblem = seen && link.url.trim() && !link.label.trim() ? MESSAGES.linkName : "";
  const problem = urlProblem || nameProblem;
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[8rem_1fr_auto]" {...touch}>
      <input aria-label={`Link ${n} name`} title="A short name for the link, like LinkedIn" aria-invalid={nameProblem ? true : undefined} value={link.label} onChange={(e) => onChange({ ...link, label: e.target.value })} maxLength={30} className={`${field} col-start-1 row-start-1`} />
      <input aria-label={`Link ${n} address`} title="The full web address, starting with https://" type="url" inputMode="url" aria-invalid={urlProblem && seen ? true : undefined} aria-describedby={problem && seen ? id : undefined} value={link.url} onChange={(e) => onChange({ ...link, url: e.target.value })} maxLength={200} placeholder={LINK_HINT[link.label.toLowerCase()] ?? "https://"} className={`${field} col-start-1 row-start-2 sm:col-start-2 sm:row-start-1`} />
      <Button type="button" variant="quiet" className="col-start-2 row-span-2 row-start-1 min-h-11 min-w-11 sm:col-start-3 sm:row-span-1" aria-label={`Remove link ${n}`} onClick={onRemove}>✕</Button>
      <div aria-live="polite" className="col-span-full">{problem && seen && <p id={id} className="text-xs text-bad"><span aria-hidden>⚠ </span>{problem}</p>}</div>
    </li>
  );
}

function RoleCard({ e, family, onChange, onRemove, n }: { e: Exp; family: Family | undefined; onChange: (e: Exp) => void; onRemove: () => void; n: number }) {
  const listId = useId();
  const duties = family?.duties ?? [];
  const own = e.bullets.filter((b) => !duties.includes(b));
  const present = e.end === "Present";
  const [startSeen, startTouch] = useTouched();
  const [endSeen, endTouch] = useTouched();
  const started = !!(e.role || e.company);
  return (
    <li className="space-y-4 rounded-xl border border-line bg-surface-2/50 p-4" aria-label={`Role ${n}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Labelled label="Job title" required tip="The title you held, for example Software Engineer." error={e.role.trim() ? "" : MESSAGES.roleTitle} showNow={!!e.company}>
          {(id) => (
            <>
              <input id={id} list={listId} value={e.role} onChange={(x) => onChange({ ...e, role: x.target.value })} placeholder="Pick or type" maxLength={100} className={field} />
              <datalist id={listId}>{family?.titles.map((t) => <option key={t} value={t} />)}</datalist>
            </>
          )}
        </Labelled>
        <Labelled label="Company" required tip="The company or organisation you worked for." error={e.company.trim() ? "" : MESSAGES.company} showNow={!!e.role}>{(id) => <input id={id} value={e.company} onChange={(x) => onChange({ ...e, company: x.target.value })} maxLength={100} className={field} />}</Labelled>
        <Labelled label="City" required tip="Where this job was based. Start typing and pick from the list." error={e.location.trim() ? "" : MESSAGES.city} showNow={started}>
          {(id) => <CityField id={id} value={e.location} onChange={(v) => onChange({ ...e, location: v })} withRegion={false} required />}
        </Labelled>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1" {...startTouch}>
          <span className="block text-xs font-medium text-ink-2">Started <span aria-hidden className="text-bad">*</span></span>
          <DateSelects label="Start" value={e.start} onChange={(v) => onChange({ ...e, start: v })} invalid={startSeen && !e.start.includes(" ")} />
          {(startSeen || started) && !(parseDate(e.start).month && parseDate(e.start).year) && <p className="text-xs text-bad"><span aria-hidden>⚠ </span>{MESSAGES.start}</p>}
        </div>
        <div className="space-y-1" {...endTouch}>
          <span className="block text-xs font-medium text-ink-2">Ended <span aria-hidden className="text-bad">*</span></span>
          {present ? <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">Present</p> : <DateSelects label="End" value={e.end} onChange={(v) => onChange({ ...e, end: v })} invalid={endSeen && !e.end} />}
          {!present && (endSeen || (started && !!e.start)) && !(parseDate(e.end).month && parseDate(e.end).year) && <p className="text-xs text-bad"><span aria-hidden>⚠ </span>{MESSAGES.end}</p>}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={present} onChange={(x) => onChange({ ...e, end: x.target.checked ? "Present" : "" })} className="size-4 accent-[var(--accent)]" />
            I work here now
          </label>
        </div>
      </div>
      {!present && monthsOf(e.start) > 0 && monthsOf(e.end) > 0 && monthsOf(e.end) < monthsOf(e.start) && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">The end date is before the start date. Please check them.</p>}
      <div>
        <p className="mb-2 text-sm font-medium">What did you do? <span className="font-normal text-ink-2">Tap all that are true.</span></p>
        {duties.length > 0 ? (
          <div role="group" aria-label={`What you did in role ${n}`} className="flex flex-wrap gap-2">
            {duties.map((d) => <Pick key={d} on={e.bullets.includes(d)} onClick={() => onChange({ ...e, bullets: toggleIn(e.bullets, d) })}>{d}</Pick>)}
          </div>
        ) : (
          <p className="text-xs text-ink-2">Pick your field above for one-tap suggestions, or add your own below.</p>
        )}
        {own.length > 0 && (
          <ul className="mt-3 space-y-2" aria-label={`Your own points for role ${n}`}>
            {own.map((b) => (
              <li key={b} className="flex items-center gap-2">
                <input aria-label="Edit point" value={b} onChange={(x) => onChange({ ...e, bullets: e.bullets.map((y) => (y === b ? x.target.value : y)) })} maxLength={300} className={field} />
                <Button type="button" variant="quiet" aria-label={`Remove point: ${b.slice(0, 30)}`} onClick={() => onChange({ ...e, bullets: e.bullets.filter((y) => y !== b) })}>✕</Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <AddOwn persistKey={`point:${e.id}`} label="your own point" existing={e.bullets} placeholder="Or write your own, a few words is enough" onAdd={(t) => onChange({ ...e, bullets: [...e.bullets, t].slice(0, 8) })} />
        </div>
        <p className="mt-2 text-xs text-ink-2">Tip: add a real number if you have one (users, %, time saved). The AI never invents numbers.</p>
      </div>
      <Button type="button" variant="quiet" className="min-h-11 !text-bad" onClick={onRemove} aria-label={`Remove role ${n}`}>Remove this role</Button>
    </li>
  );
}

function EduCard({ e, onChange, onRemove, n }: { e: Edu; onChange: (e: Edu) => void; onRemove: () => void; n: number }) {
  // the whole list when the box is empty or holds a listed degree; otherwise only what matches what is typed
  const q = e.degree.trim().toLowerCase();
  const exact = (DEGREES as readonly string[]).some((d) => d.toLowerCase() === q);
  const options = (DEGREES as readonly string[]).filter((d) => !q || exact || d.toLowerCase().includes(q)).map((d) => ({ value: d }));
  const badYears = !!checkYears(e.start, e.end);
  return (
    <li className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4" aria-label={`Education ${n}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Labelled label="Degree" required tip="Your qualification, for example B.Tech or MBA. Pick from the list or type your own." error={e.degree.trim() ? "" : MESSAGES.degree} showNow={!!e.school}>
          {(id) => <Combobox id={id} value={e.degree} onChange={(v) => onChange({ ...e, degree: v })} options={options} placeholder="Choose or type" maxLength={120} listLabel="Qualifications" chevron />}
        </Labelled>
        <Labelled label="School or college" required tip="The name of your school, college or university." error={e.school.trim() ? "" : MESSAGES.school} showNow={!!e.degree}>{(id) => <input id={id} value={e.school} onChange={(x) => onChange({ ...e, school: x.target.value })} maxLength={120} className={field} />}</Labelled>
        <div className="grid grid-cols-2 gap-2">
          <Labelled label="From year" tip="The year you started.">
            {(id) => <select id={id} value={e.start} onChange={(x) => onChange({ ...e, start: x.target.value })} className={field}><option value="">Year</option>{YEARS.map((y) => <option key={y}>{y}</option>)}</select>}
          </Labelled>
          <Labelled label="To year" tip="The year you finished, or the year you expect to finish.">
            {(id) => <select id={id} value={e.end} onChange={(x) => onChange({ ...e, end: x.target.value })} className={field}><option value="">Year</option>{YEARS.map((y) => <option key={y}>{y}</option>)}</select>}
          </Labelled>
        </div>
        <Labelled label="Grade or details (optional)" hint="For example CGPA 8.4 or First class.">
          {(id) => <input id={id} value={e.details} onChange={(x) => onChange({ ...e, details: x.target.value })} maxLength={200} className={field} />}
        </Labelled>
      </div>
      {badYears && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">The last year is before the first year. Please check them.</p>}
      <Button type="button" variant="quiet" className="min-h-11 !text-bad" onClick={onRemove} aria-label={`Remove education ${n}`}>Remove</Button>
    </li>
  );
}

/**
 * The profile page: the details that are the same for every job, filled mostly by tapping. Resumes are seeded
 * from it and the AI sharpens a copy per job, so this stays exactly as you wrote it.
 */
export function ProfileEditor() {
  const { profile, ready, saved, update } = useProfile();
  const r = profile.resume;
  const family = familyById(profile.focus);
  const score = useMemo(() => completeness(profile), [profile]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const setResume = (fn: (r: Resume) => Resume) => update((p) => ({ ...p, resume: fn(p.resume) }));
  const setContact = (patch: Partial<Resume["contact"]>) => setResume((x) => ({ ...x, contact: { ...x.contact, ...patch } }));

  // ---- name: kept in full here; the resume gets it with or without the middle name ----
  const hideMiddle = !!profile.hideMiddle;
  const nameFull = profile.nameFull && resumeName(profile.nameFull, hideMiddle) === r.contact.fullName ? profile.nameFull : r.contact.fullName;
  const phoneNow = splitPhone(r.contact.phone);
  const setName = (full: string, hide: boolean) =>
    update((p) => ({ ...p, nameFull: full, hideMiddle: hide || undefined, resume: { ...p.resume, contact: { ...p.resume.contact, fullName: resumeName(full, hide) } } }));

  // ---- skills: categories are the field's groups, plus any group the user already has ----
  const categories = useMemo(() => {
    const base = (family?.skills ?? []).map((g) => ({ label: g.label, suggestions: g.items }));
    const extra = r.skills.filter((g) => !base.some((b) => b.label === g.label) && (g.items.length || g.label)).map((g) => ({ label: g.label || "Skills", suggestions: [] as string[] }));
    return base.length || extra.length ? [...base, ...extra] : [{ label: "Skills", suggestions: [] as string[] }];
  }, [family, r.skills]);
  const selected = (label: string) => r.skills.find((g) => g.label === label)?.items ?? [];
  const skillTotal = r.skills.reduce((n, g) => n + g.items.length, 0);
  const atLimit = skillTotal >= MAX_SKILLS;
  const toggleSkill = (label: string, item: string) =>
    setResume((x) => {
      const total = x.skills.reduce((n, g) => n + g.items.length, 0);
      const has = x.skills.some((g) => g.label === label && g.items.includes(item));
      if (!has && total >= MAX_SKILLS) return x; // at the limit: removing is always allowed, adding is not
      const groups = x.skills.some((g) => g.label === label) ? x.skills : [...x.skills, { label, items: [] }];
      const next = groups.map((g) => (g.label === label ? { ...g, items: toggleIn(g.items, item).slice(0, 25) } : g)).filter((g) => g.items.length);
      return { ...x, skills: next };
    });

  const useCurrent = () => {
    try {
      const cur = loadWorkspace(getStorage()).draft.resume;
      if (!hasContent(cur)) return setImportMsg("Your current resume is empty.");
      update(() => profileFromResume(cur, profile.focus));
      setImportMsg("Done. Your current resume's details are now your profile.");
    } catch {
      setImportMsg("Could not read your current resume.");
    }
  };
  const canImport = !profileHasContent(profile);

  if (!ready) return <div role="status" className="mx-auto mt-20 h-96 max-w-3xl animate-pulse rounded-2xl bg-surface-2" aria-label="Loading profile" />;

  const addLink = (label: string) => setContact({ links: [...r.contact.links, { label, url: "" }].slice(0, 5) });

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="font-display text-lg">TomCredora</Link>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">My profile</span>
        <nav aria-label="Other modes" className="ml-auto flex flex-wrap gap-1 text-sm">
          <Link href="/quick" className="rounded-lg px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">Quick resume</Link>
          <Link href="/studio" className="rounded-lg px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">Workspace</Link>
          <Link href="/jobs" className="rounded-lg px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">Applications</Link>
          <AccountMenu />
        </nav>
      </header>
      <main id="main" className="space-y-5">

      <div>
        <h1 className="font-display text-3xl">Your profile, filled once</h1>
        <p className="mt-1 text-ink-2">The details that never change. Every resume starts from this, and the AI adds the job-specific wording on a copy, so your profile stays exactly as you set it.</p>
      </div>

      <SaveNudge kind="profile" when={ready && hasContent(profile.resume)} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium">Profile strength <span className="tabular-nums" data-testid="strength">{score.pct}%</span></p>
          <span role="status" className="text-xs text-ink-2">{saved ? "Saved in this browser" : profileHasContent(profile) ? "Saving…" : "Saved in this browser as you go"}</span>
        </div>
        <div role="progressbar" aria-label="Profile strength" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.pct} className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-[width] duration-[var(--dur)]" style={{ width: `${score.pct}%` }} />
        </div>
        {score.missing.length > 0 ? (
          <p className="mt-3 text-sm text-ink-2">Next: <span className="text-ink">{score.missing[0]}</span>{score.missing.length > 1 && ` (then ${score.missing.slice(1, 3).join(", ").toLowerCase()})`}</p>
        ) : (
          <p className="mt-3 text-sm text-accent">Complete. You can create a tailored resume now.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/quick" className="inline-flex items-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink shadow-sm hover:brightness-110">Create a resume from this</Link>
          <Button variant="ghost" onClick={() => update(() => profileFromResume(SAMPLE_RESUME, "software"))}>Load example</Button>
          <Button variant="ghost" aria-expanded={importOpen} onClick={() => setImportOpen((v) => !v)}>Import my resume</Button>
          {canImport && <Button variant="ghost" onClick={useCurrent}>Use my current resume&apos;s details</Button>}
        </div>
        {importMsg && <p role="status" className="mt-3 text-sm text-ink-2">{importMsg}</p>}
        {importOpen && (
          <div className="mt-4 border-t border-line pt-4">
            <ImportResume
              replacing={profileHasContent(profile)}
              onUse={(resume) => update(() => profileFromResume(resume, profile.focus))}
              onDone={() => {
                setImportOpen(false);
                setImportMsg("Imported. Check each section below and fix anything we got wrong.");
              }}
            />
          </div>
        )}
      </Card>

      <Section title="Your field" hint="Pick one. It gives you tap-to-add skills, job titles and duties below.">
        <div role="radiogroup" aria-label="Your field" className="flex flex-wrap gap-2">
          {FAMILIES.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={profile.focus === f.id} onClick={() => update((p) => ({ ...p, focus: p.focus === f.id ? "" : f.id }))}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${profile.focus === f.id ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:bg-surface-2"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="About you">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Labelled label="Your title (optional)" tip="The line under your name, like Frontend Developer. You can leave it empty." hint="The line under your name, like Frontend Developer.">
              {(id) => (
                <>
                  <input id={id} list="profile-titles" value={r.contact.headline} onChange={(e) => setContact({ headline: e.target.value })} maxLength={100} placeholder="Pick or type" className={field} />
                  <datalist id="profile-titles">{family?.titles.map((t) => <option key={t} value={t} />)}</datalist>
                </>
              )}
            </Labelled>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Labelled label="Full name" required tip="Your name as it should appear at the top of your resume." error={checkName(nameFull)}>{(id) => <input id={id} value={nameFull} onChange={(e) => setName(e.target.value, hideMiddle)} maxLength={80} autoComplete="name" className={field} />}</Labelled>
            <label className={`flex min-h-11 items-center gap-2 text-sm sm:min-h-0 ${!hasMiddle(nameFull) && !hideMiddle ? "text-ink-2" : ""}`}>
              <input type="checkbox" checked={hideMiddle} disabled={!hasMiddle(nameFull) && !hideMiddle} onChange={(e) => setName(nameFull, e.target.checked)} className="size-4 accent-[var(--accent)]" />
              Leave my middle name off my resume
            </label>
            {hideMiddle && hasMiddle(nameFull) ? (
              <p className="text-xs text-ink-2">On your resume: <strong className="text-ink">{withoutMiddle(nameFull)}</strong>. Your full name stays here.</p>
            ) : !hasMiddle(nameFull) ? (
              <p className="text-xs text-ink-2">Type your full name with the middle name, like Asha Kumari Rao, to use this.</p>
            ) : null}
          </div>
          <Labelled label="Email" required tip="Employers will write to this address. Use one you check often." error={checkEmail(r.contact.email)}>{(id) => <input id={id} type="email" value={r.contact.email} onChange={(e) => setContact({ email: e.target.value })} maxLength={120} autoComplete="email" className={field} />}</Labelled>
          <Labelled label="Phone" tip="Pick the country code, then type the number without it. Optional." error={checkPhone(phoneNow.number, phoneNow.dial || (countryOfLocation(r.contact.location)?.dial ?? ""))}>{(id) => <PhoneField id={id} value={r.contact.phone} onChange={(phone) => setContact({ phone })} suggestIso={countryOfLocation(r.contact.location)?.iso ?? ""} />}</Labelled>
          <div className="sm:col-span-2">
            <Labelled label="City, country" tip="Where you live. Start typing and pick from the list, or type your own." hint="Start typing and pick from the list, for example Pune. The phone code follows the country.">
              {(id) => <CityField id={id} value={r.contact.location} onChange={(v) => setContact({ location: v })} withRegion />}
            </Labelled>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Links</p>
          {r.contact.links.length > 0 && (
            <ul className="mb-3 space-y-3" aria-label="Your links">
              {r.contact.links.map((l, i) => (
                <LinkRow key={i} n={i + 1} link={l}
                  onChange={(next) => setContact({ links: r.contact.links.map((x, k) => (k === i ? next : x)) })}
                  onRemove={() => setContact({ links: r.contact.links.filter((_, k) => k !== i) })} />
              ))}
            </ul>
          )}
          {r.contact.links.length < 5 && (
            <div role="group" aria-label="Add a link" className="flex flex-wrap gap-2">
              {["LinkedIn", "GitHub", "Portfolio", "Other"]
                // a link you already added is not offered again
                .filter((n) => n === "Other" || !r.contact.links.some((l) => l.label.trim().toLowerCase() === n.toLowerCase()))
                .map((n) => <Button key={n} type="button" variant="ghost" className="min-h-11 !py-1.5 text-xs sm:min-h-0" onClick={() => addLink(n)}>+ {n}</Button>)}
            </div>
          )}
        </div>
      </Section>

      <Section title="Skills" hint={family ? `Tap the ones you really have. ${skillTotal} of ${MAX_SKILLS} chosen.` : "Pick your field above for one-tap suggestions, or add your own."}>
        {categories.map((c) => {
          const chosen = selected(c.label);
          const custom = chosen.filter((x) => !c.suggestions.includes(x));
          return (
            <div key={c.label}>
              <p className="mb-2 text-sm font-medium">{c.label}</p>
              <div role="group" aria-label={`${c.label} skills`} className="flex flex-wrap gap-2">
                {c.suggestions.map((s) => <Pick key={s} on={chosen.includes(s)} disabled={atLimit && !chosen.includes(s)} onClick={() => toggleSkill(c.label, s)}>{s}</Pick>)}
                {custom.map((s) => <Pick key={s} on onClick={() => toggleSkill(c.label, s)}>{s}</Pick>)}
              </div>
              <div className="mt-2 max-w-sm"><AddOwn persistKey={`skill:${c.label}`} label={`another ${c.label.toLowerCase()} skill`} existing={chosen} placeholder={atLimit ? "Skill limit reached" : "Add your own"} disabled={atLimit} onAdd={(t) => { if (!chosen.includes(t)) toggleSkill(c.label, t); }} /></div>
            </div>
          );
        })}
        <div role="region" aria-label="Your selected skills" className="rounded-xl border border-line bg-surface-2/50 p-4">
          <h3 className="text-sm font-medium">Your skills <span className="tabular-nums text-ink-2">({skillTotal} of {MAX_SKILLS})</span></h3>
          {atLimit && <p role="status" className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">You have chosen {MAX_SKILLS} skills, the most a resume should carry. Tap one above to remove it before adding another.</p>}
          {skillTotal === 0 ? (
            <p className="mt-1 text-sm text-ink-2">None yet. Every skill you tap above, from any group, appears here.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {r.skills.filter((g) => g.items.length > 0).map((g) => (
                <div key={g.label}>
                  <p className="text-xs text-ink-2">{g.label}</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={`${g.label}, chosen`}>
                    {g.items.map((x) => <li key={x} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">{x}</li>)}
                  </ul>
                </div>
              ))}
              <p className="text-xs text-ink-2">This is exactly what goes on your resume, from every group above. Tap a skill above to remove it.</p>
            </div>
          )}
        </div>
      </Section>

      <Section title="Work experience" hint="Jobs, internships or freelance. Pick dates, tap what you did.">
        {r.experience.length > 0 && (
          <ul className="space-y-4" aria-label="Roles">
            {r.experience.map((e, i) => (
              <RoleCard key={e.id} n={i + 1} e={e} family={family}
                onChange={(next) => setResume((x) => ({ ...x, experience: x.experience.map((y) => (y.id === e.id ? next : y)) }))}
                onRemove={() => setResume((x) => ({ ...x, experience: x.experience.filter((y) => y.id !== e.id) }))} />
            ))}
          </ul>
        )}
        {r.experience.length < 12 && <Button type="button" variant="ghost" onClick={() => setResume((x) => ({ ...x, experience: [...x.experience, { id: newId(), company: "", role: "", location: "", start: "", end: "", bullets: [] }] }))}>+ Add a role</Button>}
      </Section>

      <Section title="Education">
        {r.education.length > 0 && (
          <ul className="space-y-4" aria-label="Education">
            {r.education.map((e, i) => (
              <EduCard key={e.id} n={i + 1} e={e}
                onChange={(next) => setResume((x) => ({ ...x, education: x.education.map((y) => (y.id === e.id ? next : y)) }))}
                onRemove={() => setResume((x) => ({ ...x, education: x.education.filter((y) => y.id !== e.id) }))} />
            ))}
          </ul>
        )}
        {r.education.length < 5 && <Button type="button" variant="ghost" onClick={() => setResume((x) => ({ ...x, education: [...x.education, { id: newId(), school: "", degree: "", start: "", end: "", details: "" }] }))}>+ Add education</Button>}
      </Section>

      <Section title="Certifications" hint="Optional. Tap any you hold.">
        <div role="group" aria-label="Certifications" className="flex flex-wrap gap-2">
          {[...(family?.certs ?? []), ...r.certifications.filter((c) => !(family?.certs ?? []).includes(c))].map((c) => (
            <Pick key={c} on={r.certifications.includes(c)} onClick={() => setResume((x) => ({ ...x, certifications: toggleIn(x.certifications, c).slice(0, 10) }))}>{c}</Pick>
          ))}
        </div>
        <div className="max-w-md"><AddOwn persistKey="cert" label="another certification" existing={r.certifications} placeholder="Add your own" onAdd={(t) => setResume((x) => (x.certifications.includes(t) ? x : { ...x, certifications: [...x.certifications, t].slice(0, 10) }))} /></div>
      </Section>

      <Section title="Projects" hint="Optional. A name, what it was built with, and one line on what it does.">
        {r.projects.length > 0 && (
          <ul className="space-y-3" aria-label="Projects">
            {r.projects.map((p, i) => (
              <li key={p.id} className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface-2/50 p-4 sm:grid-cols-2" aria-label={`Project ${i + 1}`}>
                <Labelled label="Project name" required tip="What you call the project." error={p.name.trim() ? "" : MESSAGES.projectName} showNow={!!(p.link || p.tech.length || p.bullets.length)}>{(id) => <input id={id} value={p.name} onChange={(e) => setResume((x) => ({ ...x, projects: x.projects.map((y) => (y.id === p.id ? { ...y, name: e.target.value } : y)) }))} maxLength={100} className={field} />}</Labelled>
                <Labelled label="Built with (comma separated)" tip="The tools you used, separated by commas. Up to 15.">{(id) => <TechField id={id} tech={p.tech} onChange={(tech) => setResume((x) => ({ ...x, projects: x.projects.map((y) => (y.id === p.id ? { ...y, tech } : y)) }))} />}</Labelled>
                <Labelled label="Link (optional)" tip="Where someone can see it, for example a GitHub or live site address." error={checkUrl(p.link)}>{(id) => <input id={id} type="url" inputMode="url" value={p.link} onChange={(e) => setResume((x) => ({ ...x, projects: x.projects.map((y) => (y.id === p.id ? { ...y, link: e.target.value } : y)) }))} maxLength={200} placeholder="https://" className={field} />}</Labelled>
                <div className="sm:col-span-2"><Labelled label="What it does (one line)" tip="One short line on what the project does or achieved.">{(id) => <input id={id} value={p.bullets[0] ?? ""} onChange={(e) => setResume((x) => ({ ...x, projects: x.projects.map((y) => (y.id === p.id ? { ...y, bullets: e.target.value ? [e.target.value] : [] } : y)) }))} maxLength={300} className={field} />}</Labelled></div>
                <Button type="button" variant="quiet" className="min-h-11 !text-bad justify-self-start" aria-label={`Remove project ${i + 1}`} onClick={() => setResume((x) => ({ ...x, projects: x.projects.filter((y) => y.id !== p.id) }))}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
        {r.projects.length < 8 && <Button type="button" variant="ghost" onClick={() => setResume((x) => ({ ...x, projects: [...x.projects, { id: newId(), name: "", link: "", tech: [], bullets: [] }] }))}>+ Add a project</Button>}
      </Section>
      </main>
    </div>
  );
}

export type { Profile };
