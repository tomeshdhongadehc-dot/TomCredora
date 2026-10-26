"use client";

import { useId, useState, type ReactNode } from "react";
import { z } from "zod";
import { newId } from "@/lib/draft-model";
import { LIMITS, type Resume } from "@/lib/schema";
import { Button } from "../ui";
import { BulletsEditor } from "./BulletsEditor";
import { ItemList } from "./ItemList";

type Experience = Resume["experience"][number];
type Education = Resume["education"][number];
type Project = Resume["projects"][number];
type SkillGroup = Resume["skills"][number];

const emailOk = (v: string) => !v || z.email().safeParse(v).success;
const urlOk = (v: string) => !v || z.url({ protocol: /^https?$/ }).safeParse(v).success;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-2/60 transition-colors hover:border-ink-2/50 focus:border-accent";

function TextField({ label, value, onChange, error, hint, ...rest }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-ink-2">
        {label}
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${id}-d` : undefined} className={inputCls} {...rest} />
      {(error || hint) && (
        <p id={`${id}-d`} role={error ? "alert" : undefined} className={`text-xs ${error ? "text-bad" : "text-ink-2"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

function Panel({ title, summary, open, onToggle, children }: { title: string; summary?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <h2>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id} className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left hover:bg-surface-2">
          <span className="font-display text-lg">{title}</span>
          <span className="flex items-center gap-2 text-xs text-ink-2">
            {summary}
            <span aria-hidden className={`transition-transform duration-[var(--dur)] ${open ? "rotate-180" : ""}`}>⌄</span>
          </span>
        </button>
      </h2>
      {open && (
        <div id={id} className="space-y-4 border-t border-line px-4 py-4">
          {children}
        </div>
      )}
    </section>
  );
}

function DateRange({ start, end, onStart, onEnd, allowPresent = true }: { start: string; end: string; onStart: (v: string) => void; onEnd: (v: string) => void; allowPresent?: boolean }) {
  const present = /^present$/i.test(end.trim());
  return (
    <div className="grid grid-cols-2 gap-3">
      <TextField label="Start" value={start} onChange={onStart} maxLength={20} placeholder="Jan 2021" />
      <div className="space-y-1">
        <TextField label="End" value={end} onChange={onEnd} maxLength={20} placeholder="Mar 2024" disabled={present} />
        {allowPresent && (
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={present} onChange={(e) => onEnd(e.target.checked ? "Present" : "")} className="size-4 accent-[var(--accent)]" />
            I currently work here
          </label>
        )}
      </div>
    </div>
  );
}

const blankExperience = (): Experience => ({ id: newId(), company: "", role: "", location: "", start: "", end: "", bullets: [""] });
const blankEducation = (): Education => ({ id: newId(), school: "", degree: "", start: "", end: "", details: "" });
const blankProject = (): Project => ({ id: newId(), name: "", link: "", tech: [], bullets: [""] });

/**
 * Every section of the resume, editable. Works on the same Resume data as the guided wizard, so the two never disagree.
 */
export function SectionsEditor({ resume: r, setResume }: { resume: Resume; setResume: (fn: (r: Resume) => Resume) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set(["basics", "experience"]));
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const c = r.contact;
  const setContact = (patch: Partial<Resume["contact"]>) => setResume((x) => ({ ...x, contact: { ...x.contact, ...patch } }));

  return (
    <div className="space-y-3">
      <Panel title="Basics" summary={c.fullName || "Name and contact"} open={open.has("basics")} onToggle={() => toggle("basics")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Full name" value={c.fullName} onChange={(v) => setContact({ fullName: v })} maxLength={80} autoComplete="name" />
          <TextField label="Target title (shown under your name)" value={c.headline} onChange={(v) => setContact({ headline: v })} maxLength={100} placeholder="Senior Frontend Engineer" />
          <TextField label="Email" type="email" value={c.email} onChange={(v) => setContact({ email: v })} maxLength={120} autoComplete="email" error={emailOk(c.email) ? undefined : "Enter a valid email address"} />
          <TextField label="Phone" type="tel" value={c.phone} onChange={(v) => setContact({ phone: v })} maxLength={30} autoComplete="tel" />
          <TextField label="Location" value={c.location} onChange={(v) => setContact({ location: v })} maxLength={80} placeholder="Bengaluru, India" />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-ink-2">Links (LinkedIn, portfolio, GitHub)</p>
          <div className="space-y-2">
            {c.links.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[7rem_1fr_auto]">
                <div className="col-span-2 sm:col-span-1">
                  <TextField label={`Link ${i + 1} label`} value={l.label} onChange={(v) => setContact({ links: c.links.map((x, j) => (j === i ? { ...x, label: v } : x)) })} maxLength={30} placeholder="LinkedIn" />
                </div>
                <TextField label={`Link ${i + 1} URL`} type="url" value={l.url} onChange={(v) => setContact({ links: c.links.map((x, j) => (j === i ? { ...x, url: v } : x)) })} maxLength={200} placeholder="https://linkedin.com/in/you" error={urlOk(l.url) ? undefined : "Use a full https:// link"} />
                <Button variant="quiet" className="mb-0.5 !px-2 text-xs text-bad" aria-label={`Delete link ${i + 1}`} onClick={() => setContact({ links: c.links.filter((_, j) => j !== i) })}>Delete</Button>
              </div>
            ))}
            <Button variant="ghost" className="!py-1.5 text-xs" disabled={c.links.length >= 5} onClick={() => setContact({ links: [...c.links, { label: "Link", url: "" }] })}>+ Add link</Button>
          </div>
        </div>
      </Panel>

      <Panel title="Summary" summary={r.summary ? `${words(r.summary)} words` : "Optional"} open={open.has("summary")} onToggle={() => toggle("summary")}>
        <div className="space-y-1">
          <label htmlFor="summary-field" className="block text-xs font-medium text-ink-2">
            A short introduction (2 to 3 lines)
          </label>
          <textarea id="summary-field" rows={4} value={r.summary} maxLength={LIMITS.summary} onChange={(e) => setResume((x) => ({ ...x, summary: e.target.value }))} placeholder="Frontend engineer with 6 years building React and TypeScript products..." className={`${inputCls} resize-y leading-relaxed`} />
          <p className={`text-xs ${r.summary && words(r.summary) > 45 ? "text-warn" : "text-ink-2"}`}>
            {words(r.summary)} words. Aim for 45 or fewer.
          </p>
        </div>
      </Panel>

      <Panel title="Experience" summary={`${r.experience.length} role${r.experience.length === 1 ? "" : "s"}`} open={open.has("experience")} onToggle={() => toggle("experience")}>
        <ItemList<Experience>
          noun="Role"
          items={r.experience}
          onChange={(experience) => setResume((x) => ({ ...x, experience }))}
          getKey={(e) => e.id}
          create={blankExperience}
          copy={(e) => ({ ...structuredClone(e), id: newId() })}
          addLabel="Add role"
          title={(e) => [e.role, e.company].filter(Boolean).join(" at ")}
          subtitle={(e) => [e.start, e.end].filter(Boolean).join(" - ")}
          emptyHint="Add your most recent role first."
          max={LIMITS.roles}
        >
          {(e, update) => (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Job title" value={e.role} onChange={(v) => update({ role: v })} maxLength={100} />
                <TextField label="Company" value={e.company} onChange={(v) => update({ company: v })} maxLength={100} />
                <TextField label="Location" value={e.location} onChange={(v) => update({ location: v })} maxLength={80} />
              </div>
              <DateRange start={e.start} end={e.end} onStart={(v) => update({ start: v })} onEnd={(v) => update({ end: v })} />
              <BulletsEditor label="Bullet" bullets={e.bullets} onChange={(bullets) => update({ bullets })} />
            </>
          )}
        </ItemList>
      </Panel>

      <Panel title="Education" summary={`${r.education.length}`} open={open.has("education")} onToggle={() => toggle("education")}>
        <ItemList<Education>
          noun="School"
          items={r.education}
          onChange={(education) => setResume((x) => ({ ...x, education }))}
          getKey={(e) => e.id}
          create={blankEducation}
          copy={(e) => ({ ...structuredClone(e), id: newId() })}
          addLabel="Add education"
          title={(e) => [e.degree, e.school].filter(Boolean).join(", ")}
          subtitle={(e) => [e.start, e.end].filter(Boolean).join(" - ")}
          max={5}
        >
          {(e, update) => (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="School" value={e.school} onChange={(v) => update({ school: v })} maxLength={120} />
                <TextField label="Degree" value={e.degree} onChange={(v) => update({ degree: v })} maxLength={120} />
              </div>
              <DateRange start={e.start} end={e.end} onStart={(v) => update({ start: v })} onEnd={(v) => update({ end: v })} allowPresent={false} />
              <TextField label="Details (grade, honours)" value={e.details} onChange={(v) => update({ details: v })} maxLength={200} />
            </>
          )}
        </ItemList>
      </Panel>

      <Panel title="Skills" summary={`${r.skills.filter((g) => g.items.some((i) => i.trim())).length} groups`} open={open.has("skills")} onToggle={() => toggle("skills")}>
        <ItemList<SkillGroup>
          noun="Skill group"
          items={r.skills}
          onChange={(skills) => setResume((x) => ({ ...x, skills }))}
          getKey={(_, i) => `g${i}`}
          create={() => ({ label: "", items: [] })}
          addLabel="Add skill group"
          title={(g) => g.label}
          subtitle={(g) => g.items.filter((i) => i.trim()).join(", ")}
          max={8}
        >
          {(g, update) => (
            <>
              <TextField label="Group name" value={g.label} onChange={(v) => update({ label: v })} maxLength={40} placeholder="Languages" />
              <TextField label="Skills, separated by commas" value={g.items.join(",")} onChange={(v) => update({ items: v.split(",") })} placeholder="TypeScript, React, SQL" hint="Only list skills you genuinely have." />
            </>
          )}
        </ItemList>
      </Panel>

      <Panel title="Projects" summary={`${r.projects.length}`} open={open.has("projects")} onToggle={() => toggle("projects")}>
        <ItemList<Project>
          noun="Project"
          items={r.projects}
          onChange={(projects) => setResume((x) => ({ ...x, projects }))}
          getKey={(p) => p.id}
          create={blankProject}
          copy={(p) => ({ ...structuredClone(p), id: newId() })}
          addLabel="Add project"
          title={(p) => p.name}
          subtitle={(p) => p.tech.filter((t) => t.trim()).join(", ")}
          emptyHint="Optional. Good for students and career changers."
          max={8}
        >
          {(p, update) => (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Project name" value={p.name} onChange={(v) => update({ name: v })} maxLength={100} />
                <TextField label="Link (optional)" value={p.link} onChange={(v) => update({ link: v })} maxLength={200} placeholder="github.com/you/project" />
              </div>
              <TextField label="Technologies, separated by commas" value={p.tech.join(",")} onChange={(v) => update({ tech: v.split(",") })} placeholder="React, Node.js, PostgreSQL" />
              <BulletsEditor label="Bullet" bullets={p.bullets} max={5} onChange={(bullets) => update({ bullets })} />
            </>
          )}
        </ItemList>
      </Panel>

      <Panel title="Certifications" summary={`${r.certifications.length}`} open={open.has("certifications")} onToggle={() => toggle("certifications")}>
        <CertificationList items={r.certifications} onChange={(certifications) => setResume((x) => ({ ...x, certifications }))} />
      </Panel>
    </div>
  );
}

function CertificationList({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const uid = useId();
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-sm text-ink-2">Optional. Licences and certificates, newest first.</p>}
      {items.map((c, i) => (
        <div key={i} className="flex items-center gap-1">
          <label htmlFor={`${uid}-${i}`} className="sr-only">Certification {i + 1}</label>
          <input id={`${uid}-${i}`} value={c} maxLength={120} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} placeholder="AWS Certified Developer - Associate" className={inputCls} />
          <Button variant="quiet" className="!px-2 !py-0.5" aria-label={`Move certification ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
          <Button variant="quiet" className="!px-2 !py-0.5" aria-label={`Move certification ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</Button>
          <Button variant="quiet" className="!px-2 !py-0.5 text-xs text-bad" aria-label={`Delete certification ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>Delete</Button>
        </div>
      ))}
      <Button variant="ghost" className="!py-1.5 text-xs" disabled={items.length >= 10} onClick={() => onChange([...items, ""])}>+ Add certification</Button>
    </div>
  );
}
