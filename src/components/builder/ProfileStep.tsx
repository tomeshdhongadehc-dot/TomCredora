"use client";

import { newId } from "@/lib/draft";
import type { Resume } from "@/lib/schema";
import { Button, Card, Field, Input, Textarea } from "../ui";

interface Props {
  resume: Resume;
  setResume: (fn: (r: Resume) => Resume) => void;
  errors: Record<string, string>;
}

const lines = (s: string) => s.split("\n");

export function ProfileStep({ resume: r, setResume, errors }: Props) {
  const c = r.contact;
  const setContact = (patch: Partial<Resume["contact"]>) => setResume((x) => ({ ...x, contact: { ...x.contact, ...patch } }));
  const updExp = (id: string, patch: Partial<Resume["experience"][number]>) =>
    setResume((x) => ({ ...x, experience: x.experience.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const updEdu = (id: string, patch: Partial<Resume["education"][number]>) =>
    setResume((x) => ({ ...x, education: x.education.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="font-display text-xl">Contact</h2>
        <p className="mb-4 text-sm text-ink-2">Your name, email, phone and links are never sent to the AI.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name" error={errors["contact.fullName"]}>
            <Input id="name" autoComplete="name" value={c.fullName} onChange={(e) => setContact({ fullName: e.target.value })} maxLength={80} />
          </Field>
          <Field label="Target title (optional)" htmlFor="headline">
            <Input id="headline" value={c.headline} onChange={(e) => setContact({ headline: e.target.value })} maxLength={100} placeholder="Senior Frontend Engineer" />
          </Field>
          <Field label="Email" htmlFor="email" error={errors["contact.email"]}>
            <Input id="email" type="email" autoComplete="email" value={c.email} onChange={(e) => setContact({ email: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" type="tel" autoComplete="tel" value={c.phone} onChange={(e) => setContact({ phone: e.target.value })} maxLength={30} />
          </Field>
          <Field label="Location" htmlFor="loc">
            <Input id="loc" autoComplete="address-level2" value={c.location} onChange={(e) => setContact({ location: e.target.value })} maxLength={80} placeholder="Bengaluru, India" />
          </Field>
          <Field label="LinkedIn / portfolio URL" htmlFor="link" error={errors["contact.links.0.url"] && "Use a full https:// link"}>
            <Input
              id="link"
              type="url"
              inputMode="url"
              value={c.links[0]?.url ?? ""}
              onChange={(e) => setContact({ links: [{ label: "Link", url: e.target.value }] })}
              placeholder="https://linkedin.com/in/you"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-xl">Experience</h2>
        <p className="mb-4 text-sm text-ink-2">
          Write what you really did, one bullet per line, rough is fine. Include numbers you can stand behind. The AI only rewords facts you give it.
        </p>
        <div className="space-y-6">
          {r.experience.map((e, i) => (
            <div key={e.id} className="rise space-y-3 rounded-xl border border-line bg-bg/50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-ink-2">Role {i + 1}</h3>
                <Button variant="quiet" className="!px-2 !py-1 text-xs" onClick={() => setResume((x) => ({ ...x, experience: x.experience.filter((y) => y.id !== e.id) }))}>
                  Remove
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Job title" htmlFor={`role-${e.id}`}>
                  <Input id={`role-${e.id}`} value={e.role} onChange={(ev) => updExp(e.id, { role: ev.target.value })} maxLength={100} />
                </Field>
                <Field label="Company" htmlFor={`co-${e.id}`}>
                  <Input id={`co-${e.id}`} value={e.company} onChange={(ev) => updExp(e.id, { company: ev.target.value })} maxLength={100} />
                </Field>
                <Field label="Start" htmlFor={`s-${e.id}`} hint='e.g. "Jan 2021"'>
                  <Input id={`s-${e.id}`} value={e.start} onChange={(ev) => updExp(e.id, { start: ev.target.value })} maxLength={20} />
                </Field>
                <Field label="End" htmlFor={`en-${e.id}`} hint='e.g. "Mar 2024" or "Present"'>
                  <Input id={`en-${e.id}`} value={e.end} onChange={(ev) => updExp(e.id, { end: ev.target.value })} maxLength={20} />
                </Field>
              </div>
              <Field label="What you did (one per line)" htmlFor={`b-${e.id}`} hint={`${e.bullets.filter((b) => b.trim()).length} bullets. Aim for 3-5.`}>
                <Textarea id={`b-${e.id}`} rows={5} value={e.bullets.join("\n")} onChange={(ev) => updExp(e.id, { bullets: lines(ev.target.value) })} />
              </Field>
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={() =>
              setResume((x) => ({
                ...x,
                experience: [...x.experience, { id: newId(), company: "", role: "", location: "", start: "", end: "", bullets: [""] }],
              }))
            }
          >
            + Add role
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-xl">Skills</h2>
        <p className="mb-4 text-sm text-ink-2">Group your skills, separated by commas. Only list skills you genuinely have.</p>
        <div className="space-y-3">
          {r.skills.map((g, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
              <Field label="Group" htmlFor={`sg-${i}`}>
                <Input id={`sg-${i}`} value={g.label} maxLength={40} onChange={(ev) => setResume((x) => ({ ...x, skills: x.skills.map((s, j) => (j === i ? { ...s, label: ev.target.value } : s)) }))} placeholder="Languages" />
              </Field>
              <Field label="Skills" htmlFor={`si-${i}`}>
                <Input id={`si-${i}`} value={g.items.join(",")} onChange={(ev) => setResume((x) => ({ ...x, skills: x.skills.map((s, j) => (j === i ? { ...s, items: ev.target.value.split(",") } : s)) }))} placeholder="TypeScript, React, SQL" />
              </Field>
              {r.skills.length > 1 && (
                <Button variant="quiet" className="!px-2 text-xs" onClick={() => setResume((x) => ({ ...x, skills: x.skills.filter((_, j) => j !== i) }))}>
                  Remove
                </Button>
              )}
            </div>
          ))}
          {r.skills.length < 8 && (
            <Button variant="ghost" onClick={() => setResume((x) => ({ ...x, skills: [...x.skills, { label: "", items: [] }] }))}>
              + Add group
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-xl">Education</h2>
        <div className="mt-4 space-y-4">
          {r.education.map((e) => (
            <div key={e.id} className="rise grid gap-3 rounded-xl border border-line bg-bg/50 p-4 sm:grid-cols-2">
              <Field label="School" htmlFor={`sc-${e.id}`}>
                <Input id={`sc-${e.id}`} value={e.school} onChange={(ev) => updEdu(e.id, { school: ev.target.value })} maxLength={120} />
              </Field>
              <Field label="Degree" htmlFor={`dg-${e.id}`}>
                <Input id={`dg-${e.id}`} value={e.degree} onChange={(ev) => updEdu(e.id, { degree: ev.target.value })} maxLength={120} />
              </Field>
              <Field label="Start" htmlFor={`es-${e.id}`}>
                <Input id={`es-${e.id}`} value={e.start} onChange={(ev) => updEdu(e.id, { start: ev.target.value })} maxLength={20} />
              </Field>
              <Field label="End" htmlFor={`ee-${e.id}`}>
                <Input id={`ee-${e.id}`} value={e.end} onChange={(ev) => updEdu(e.id, { end: ev.target.value })} maxLength={20} />
              </Field>
              <div className="sm:col-span-2">
                <Button variant="quiet" className="!px-2 !py-1 text-xs" onClick={() => setResume((x) => ({ ...x, education: x.education.filter((y) => y.id !== e.id) }))}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {r.education.length < 5 && (
            <Button variant="ghost" onClick={() => setResume((x) => ({ ...x, education: [...x.education, { id: newId(), school: "", degree: "", start: "", end: "", details: "" }] }))}>
              + Add education
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
