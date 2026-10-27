"use client";

import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import { DEGREES, FAMILIES, MONTHS, familyById, formatDate, parseDate, yearsFrom, type Family } from "@/lib/catalog";
import { newId } from "@/lib/draft-model";
import { getStorage } from "@/lib/draft";
import { completeness, profileFromResume, profileHasContent, type Profile } from "@/lib/profile";
import { SAMPLE_RESUME } from "@/lib/sample";
import { usePersistedText } from "@/lib/use-persisted-text";
import { useProfile } from "@/lib/use-profile";
import { loadWorkspace } from "@/lib/workspace";
import { hasContent } from "@/lib/draft-model";
import type { Resume } from "@/lib/schema";
import { AccountMenu } from "../account/AccountMenu";
import { SaveNudge } from "../account/SaveNudge";
import { Button, Card } from "../ui";

type Exp = Resume["experience"][number];
type Edu = Resume["education"][number];

const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-2/60 transition-colors hover:border-ink-2/50 focus:border-accent";
const THIS_YEAR = new Date().getFullYear();
const YEARS = yearsFrom(THIS_YEAR);

/** A tap-to-toggle choice. */
function Pick({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors duration-[var(--dur-fast)] ${on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink hover:border-ink-2/60 hover:bg-surface-2"}`}
    >
      {on && <span aria-hidden>✓ </span>}
      {children}
    </button>
  );
}

function Labelled({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-ink-2">{label}</label>
      {children(id)}
      {hint && <p className="text-xs text-ink-2">{hint}</p>}
    </div>
  );
}

/** One line to add your own item (Enter or the button). */
function AddOwn({ label, placeholder, onAdd, persistKey }: { label: string; placeholder: string; onAdd: (v: string) => void; persistKey: string }) {
  const [v, setV] = usePersistedText(persistKey);
  const id = useId();
  const submit = () => {
    const t = v.trim();
    if (!t) return;
    onAdd(t);
    setV("");
  };
  return (
    <div className="flex gap-2">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} placeholder={placeholder} maxLength={120} className={field} />
      <Button type="button" variant="ghost" onClick={submit} disabled={!v.trim()} aria-label={`Add: ${label}`}>Add</Button>
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

function DateSelects({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { month, year } = parseDate(value);
  return (
    <div className="flex gap-2">
      <select aria-label={`${label} month`} value={month} onChange={(e) => onChange(formatDate(e.target.value, year))} className={field}>
        <option value="">Month</option>
        {MONTHS.map((m) => <option key={m}>{m}</option>)}
      </select>
      <select aria-label={`${label} year`} value={year} onChange={(e) => onChange(formatDate(month, e.target.value))} className={field}>
        <option value="">Year</option>
        {YEARS.map((y) => <option key={y}>{y}</option>)}
      </select>
    </div>
  );
}

function RoleCard({ e, family, onChange, onRemove, n }: { e: Exp; family: Family | undefined; onChange: (e: Exp) => void; onRemove: () => void; n: number }) {
  const listId = useId();
  const duties = family?.duties ?? [];
  const own = e.bullets.filter((b) => !duties.includes(b));
  const present = e.end === "Present";
  return (
    <li className="space-y-4 rounded-xl border border-line bg-surface-2/50 p-4" aria-label={`Role ${n}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label="Job title">
          {(id) => (
            <>
              <input id={id} list={listId} value={e.role} onChange={(x) => onChange({ ...e, role: x.target.value })} placeholder="Pick or type" maxLength={100} className={field} />
              <datalist id={listId}>{family?.titles.map((t) => <option key={t} value={t} />)}</datalist>
            </>
          )}
        </Labelled>
        <Labelled label="Company">{(id) => <input id={id} value={e.company} onChange={(x) => onChange({ ...e, company: x.target.value })} maxLength={100} className={field} />}</Labelled>
        <Labelled label="City (optional)">{(id) => <input id={id} value={e.location} onChange={(x) => onChange({ ...e, location: x.target.value })} maxLength={80} className={field} />}</Labelled>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="block text-xs font-medium text-ink-2">Started</span>
          <DateSelects label="Start" value={e.start} onChange={(v) => onChange({ ...e, start: v })} />
        </div>
        <div className="space-y-1">
          <span className="block text-xs font-medium text-ink-2">Ended</span>
          {present ? <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">Present</p> : <DateSelects label="End" value={e.end} onChange={(v) => onChange({ ...e, end: v })} />}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={present} onChange={(x) => onChange({ ...e, end: x.target.checked ? "Present" : "" })} className="size-4 accent-[var(--accent)]" />
            I work here now
          </label>
        </div>
      </div>
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
          <AddOwn persistKey={`point:${e.id}`} label="your own point" placeholder="Or write your own, a few words is enough" onAdd={(t) => onChange({ ...e, bullets: [...e.bullets, t].slice(0, 8) })} />
        </div>
        <p className="mt-2 text-xs text-ink-2">Tip: add a real number if you have one (users, %, time saved). The AI never invents numbers.</p>
      </div>
      <Button type="button" variant="quiet" className="!text-bad" onClick={onRemove} aria-label={`Remove role ${n}`}>Remove this role</Button>
    </li>
  );
}

function EduCard({ e, onChange, onRemove, n }: { e: Edu; onChange: (e: Edu) => void; onRemove: () => void; n: number }) {
  const known = (DEGREES as readonly string[]).includes(e.degree);
  const [other, setOther] = useState(!!e.degree && !known);
  return (
    <li className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4" aria-label={`Education ${n}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label="Degree">
          {(id) => (
            <select id={id} value={other ? "__other" : e.degree} onChange={(x) => { if (x.target.value === "__other") { setOther(true); onChange({ ...e, degree: "" }); } else { setOther(false); onChange({ ...e, degree: x.target.value }); } }} className={field}>
              <option value="">Choose</option>
              {DEGREES.map((d) => <option key={d}>{d}</option>)}
              <option value="__other">Other…</option>
            </select>
          )}
        </Labelled>
        {other ? <Labelled label="Your degree">{(id) => <input id={id} value={e.degree} onChange={(x) => onChange({ ...e, degree: x.target.value })} maxLength={120} placeholder="e.g. B.Des Interaction Design" className={field} />}</Labelled> : <span className="hidden sm:block" />}
        <Labelled label="School or college">{(id) => <input id={id} value={e.school} onChange={(x) => onChange({ ...e, school: x.target.value })} maxLength={120} className={field} />}</Labelled>
        <div className="grid grid-cols-2 gap-2">
          <Labelled label="From year">
            {(id) => <select id={id} value={e.start} onChange={(x) => onChange({ ...e, start: x.target.value })} className={field}><option value="">Year</option>{YEARS.map((y) => <option key={y}>{y}</option>)}</select>}
          </Labelled>
          <Labelled label="To year">
            {(id) => <select id={id} value={e.end} onChange={(x) => onChange({ ...e, end: x.target.value })} className={field}><option value="">Year</option>{YEARS.map((y) => <option key={y}>{y}</option>)}</select>}
          </Labelled>
        </div>
      </div>
      <Button type="button" variant="quiet" className="!text-bad" onClick={onRemove} aria-label={`Remove education ${n}`}>Remove</Button>
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

  const setResume = (fn: (r: Resume) => Resume) => update((p) => ({ ...p, resume: fn(p.resume) }));
  const setContact = (patch: Partial<Resume["contact"]>) => setResume((x) => ({ ...x, contact: { ...x.contact, ...patch } }));

  // ---- skills: categories are the field's groups, plus any group the user already has ----
  const categories = useMemo(() => {
    const base = (family?.skills ?? []).map((g) => ({ label: g.label, suggestions: g.items }));
    const extra = r.skills.filter((g) => !base.some((b) => b.label === g.label) && (g.items.length || g.label)).map((g) => ({ label: g.label || "Skills", suggestions: [] as string[] }));
    return base.length || extra.length ? [...base, ...extra] : [{ label: "Skills", suggestions: [] as string[] }];
  }, [family, r.skills]);
  const selected = (label: string) => r.skills.find((g) => g.label === label)?.items ?? [];
  const toggleSkill = (label: string, item: string) =>
    setResume((x) => {
      const groups = x.skills.some((g) => g.label === label) ? x.skills : [...x.skills, { label, items: [] }];
      const next = groups.map((g) => (g.label === label ? { ...g, items: toggleIn(g.items, item).slice(0, 25) } : g)).filter((g) => g.items.length);
      return { ...x, skills: next };
    });
  const skillTotal = r.skills.reduce((n, g) => n + g.items.length, 0);

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
        <nav aria-label="Other modes" className="ml-auto flex gap-1 text-sm">
          <Link href="/quick" className="rounded-lg px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">Quick resume</Link>
          <Link href="/studio" className="rounded-lg px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">Workspace</Link>
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
          {canImport && <Button variant="ghost" onClick={useCurrent}>Use my current resume&apos;s details</Button>}
        </div>
        {importMsg && <p role="status" className="mt-3 text-sm text-ink-2">{importMsg}</p>}
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled label="Full name">{(id) => <input id={id} value={r.contact.fullName} onChange={(e) => setContact({ fullName: e.target.value })} maxLength={80} autoComplete="name" className={field} />}</Labelled>
          <Labelled label="Email">{(id) => <input id={id} type="email" value={r.contact.email} onChange={(e) => setContact({ email: e.target.value })} maxLength={120} autoComplete="email" className={field} />}</Labelled>
          <Labelled label="Phone">{(id) => <input id={id} type="tel" value={r.contact.phone} onChange={(e) => setContact({ phone: e.target.value })} maxLength={30} autoComplete="tel" className={field} />}</Labelled>
          <Labelled label="City, country">{(id) => <input id={id} value={r.contact.location} onChange={(e) => setContact({ location: e.target.value })} maxLength={80} autoComplete="address-level2" className={field} />}</Labelled>
          <Labelled label="Your title (optional)">
            {(id) => (
              <>
                <input id={id} list="profile-titles" value={r.contact.headline} onChange={(e) => setContact({ headline: e.target.value })} maxLength={100} placeholder="Pick or type" className={field} />
                <datalist id="profile-titles">{family?.titles.map((t) => <option key={t} value={t} />)}</datalist>
              </>
            )}
          </Labelled>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Links</p>
          {r.contact.links.length > 0 && (
            <ul className="mb-3 space-y-2" aria-label="Your links">
              {r.contact.links.map((l, i) => (
                <li key={i} className="grid grid-cols-[8rem_1fr_auto] items-center gap-2">
                  <input aria-label={`Link ${i + 1} name`} value={l.label} onChange={(e) => setContact({ links: r.contact.links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} maxLength={30} className={field} />
                  <input aria-label={`Link ${i + 1} address`} type="url" value={l.url} onChange={(e) => setContact({ links: r.contact.links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)) })} maxLength={200} placeholder="https://" className={field} />
                  <Button type="button" variant="quiet" aria-label={`Remove link ${i + 1}`} onClick={() => setContact({ links: r.contact.links.filter((_, k) => k !== i) })}>✕</Button>
                </li>
              ))}
            </ul>
          )}
          {r.contact.links.length < 5 && (
            <div role="group" aria-label="Add a link" className="flex flex-wrap gap-2">
              {["LinkedIn", "GitHub", "Portfolio", "Other"].map((n) => <Button key={n} type="button" variant="ghost" className="!py-1.5 text-xs" onClick={() => addLink(n)}>+ {n}</Button>)}
            </div>
          )}
        </div>
      </Section>

      <Section title="Skills" hint={family ? `Tap the ones you really have. ${skillTotal} chosen.` : "Pick your field above for one-tap suggestions, or add your own."}>
        {categories.map((c) => {
          const chosen = selected(c.label);
          const custom = chosen.filter((x) => !c.suggestions.includes(x));
          return (
            <div key={c.label}>
              <p className="mb-2 text-sm font-medium">{c.label}</p>
              <div role="group" aria-label={`${c.label} skills`} className="flex flex-wrap gap-2">
                {c.suggestions.map((s) => <Pick key={s} on={chosen.includes(s)} onClick={() => toggleSkill(c.label, s)}>{s}</Pick>)}
                {custom.map((s) => <Pick key={s} on onClick={() => toggleSkill(c.label, s)}>{s}</Pick>)}
              </div>
              <div className="mt-2 max-w-sm"><AddOwn persistKey={`skill:${c.label}`} label={`another ${c.label.toLowerCase()} skill`} placeholder="Add your own" onAdd={(t) => { if (!chosen.includes(t)) toggleSkill(c.label, t); }} /></div>
            </div>
          );
        })}
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
        <div className="max-w-md"><AddOwn persistKey="cert" label="another certification" placeholder="Add your own" onAdd={(t) => setResume((x) => (x.certifications.includes(t) ? x : { ...x, certifications: [...x.certifications, t].slice(0, 10) }))} /></div>
      </Section>

      <Section title="Projects" hint="Optional. A name, what it was built with, and one line on what it does.">
        {r.projects.length > 0 && (
          <ul className="space-y-3" aria-label="Projects">
            {r.projects.map((p, i) => (
              <li key={p.id} className="grid gap-3 rounded-xl border border-line bg-surface-2/50 p-4 sm:grid-cols-2" aria-label={`Project ${i + 1}`}>
                <Labelled label="Project name">{(id) => <input id={id} value={p.name} onChange={(e) => setResume((x) => ({ ...x, projects: x.projects.map((y) => (y.id === p.id ? { ...y, name: e.target.value } : y)) }))} maxLength={100} className={field} />}</Labelled>
                <Labelled label="Built with (comma separated)">{(id) => <TechField id={id} tech={p.tech} onChange={(tech) => setResume((x) => ({ ...x, projects: x.projects.map((y) => (y.id === p.id ? { ...y, tech } : y)) }))} />}</Labelled>
                <div className="sm:col-span-2"><Labelled label="What it does (one line)">{(id) => <input id={id} value={p.bullets[0] ?? ""} onChange={(e) => setResume((x) => ({ ...x, projects: x.projects.map((y) => (y.id === p.id ? { ...y, bullets: e.target.value ? [e.target.value] : [] } : y)) }))} maxLength={300} className={field} />}</Labelled></div>
                <Button type="button" variant="quiet" className="!text-bad justify-self-start" aria-label={`Remove project ${i + 1}`} onClick={() => setResume((x) => ({ ...x, projects: x.projects.filter((y) => y.id !== p.id) }))}>Remove</Button>
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
