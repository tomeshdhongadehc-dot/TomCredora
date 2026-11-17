"use client";

import { useMemo, useState } from "react";
import { callAi } from "@/lib/ai-client";
import type { BulletMode, BulletResult, RewriteKind } from "@/lib/ai/polish";
import type { Resume } from "@/lib/schema";
import { LIMITS } from "@/lib/schema";
import { skillGap } from "@/lib/skill-gap";
import { Button, Card } from "../ui";

type State =
  | { s: "busy"; mode: BulletMode | "custom" }
  | { s: "proposal"; mode: BulletMode | "custom"; keyword?: string; instruction?: string; text: string; novel: string[] }
  | { s: "editing"; text: string }
  | { s: "asking"; instruction: string }
  | { s: "keywords" }
  | { s: "error"; message: string };

/** One thing that can be changed: the summary, a job point or a project line. */
interface Item {
  k: string;
  kind: RewriteKind;
  text: string;
  role: string;
  company: string;
  /** the one-tap helpers (shorter, stronger verb, keyword) are for points, not the summary */
  helpers: boolean;
  max: number;
  apply: (text: string) => Resume;
}

const short = (t: string) => (t.length > 40 ? `${t.slice(0, 40)}…` : t);
const IDEAS = ["Make it sound more senior", "Focus on teamwork", "Use the job's keywords", "Make it shorter", "Sound more confident"];

/**
 * Change one piece at a time: the summary, each job point and each project line. By hand, with one tap (shorter,
 * stronger verb, a keyword the person really has), or by telling the AI what is wanted in their own words. The AI only
 * sees that one piece, the job description and the person's skill names (never contact details). Nothing changes until
 * the person chooses "Use this", and anything the AI added that was not in the original is called out.
 */
export function BulletPolish({ resume, jd, apiKey, onChange }: { resume: Resume; jd: string; apiKey: string; onChange: (r: Resume) => void }) {
  const [state, setState] = useState<Record<string, State | undefined>>({});
  const set = (k: string, v: State | undefined) => setState((cur) => ({ ...cur, [k]: v }));

  const haveSkills = useMemo(() => skillGap(jd, resume).have, [jd, resume]);
  const skillNames = useMemo(() => [...new Set(resume.skills.flatMap((g) => g.items))], [resume.skills]);

  const setBullet = (roleId: string, index: number, text: string): Resume => ({
    ...resume,
    experience: resume.experience.map((e) => (e.id === roleId ? { ...e, bullets: e.bullets.map((b, i) => (i === index ? text : b)) } : e)),
  });
  const setProjectLine = (id: string, index: number, text: string): Resume => ({
    ...resume,
    projects: resume.projects.map((p) => (p.id === id ? { ...p, bullets: index < p.bullets.length ? p.bullets.map((b, i) => (i === index ? text : b)) : [...p.bullets, text] } : p)),
  });

  const roles = resume.experience.filter((e) => e.bullets.length > 0);
  const summaryItem: Item = { k: "summary", kind: "summary", text: resume.summary, role: "", company: "", helpers: false, max: LIMITS.summary, apply: (t) => ({ ...resume, summary: t }) };

  async function run(it: Item, mode: BulletMode | "custom", extra?: { keyword?: string; instruction?: string }) {
    set(it.k, { s: "busy", mode });
    const skills = (extra?.keyword && !skillNames.includes(extra.keyword) ? [...skillNames, extra.keyword] : skillNames).slice(0, 80);
    const r =
      mode === "custom"
        ? await callAi<BulletResult>("/api/v1/rewrite", { kind: it.kind, text: it.text, instruction: extra?.instruction ?? "", role: it.role, company: it.company, skills, jd: jd.slice(0, 3000) }, apiKey)
        : await callAi<BulletResult>("/api/v1/bullet", { bullet: it.text, mode, role: it.role, company: it.company, skills, ...(extra?.keyword ? { keyword: extra.keyword } : {}) }, apiKey);
    set(it.k, r.ok ? { s: "proposal", mode, keyword: extra?.keyword, instruction: extra?.instruction, text: r.data.text, novel: r.data.novel } : { s: "error", message: r.message });
  }

  const btn = "min-h-11 flex-1 px-3 py-1.5 text-xs sm:min-h-9 sm:flex-none";

  function row(it: Item) {
    const st = state[it.k];
    const busy = st?.s === "busy";
    const candidates = it.helpers ? haveSkills.filter((s) => !it.text.toLowerCase().includes(s.toLowerCase())).slice(0, 8) : [];
    const can = it.text.trim().length >= 5; // the AI needs something to work from
    const label = it.kind === "summary" ? "summary" : "point";
    const save = (text: string) => {
      onChange(it.apply(text.slice(0, it.max)));
      set(it.k, undefined);
    };
    return (
      <li key={it.k} className="rounded-lg bg-surface-2/60 p-3">
        {st?.s === "editing" ? (
          <div className="space-y-2">
            <label htmlFor={`edit-${it.k}`} className="sr-only">Edit this {label}</label>
            <textarea
              id={`edit-${it.k}`}
              value={st.text}
              maxLength={it.max}
              rows={it.kind === "summary" ? 5 : 3}
              onChange={(ev) => set(it.k, { s: "editing", text: ev.target.value })}
              className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-base leading-relaxed sm:text-sm"
            />
            <p className="text-xs text-ink-2" aria-live="polite">{st.text.length} of {it.max} characters</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="min-h-11 w-full sm:w-auto" disabled={st.text.trim().length < 3 && it.kind !== "summary"} onClick={() => save(st.text.trim())}>Save</Button>
              <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={() => set(it.k, undefined)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            {it.text ? <p className="break-words text-sm leading-relaxed">{it.text}</p> : <p className="text-sm text-ink-2">Nothing here yet.</p>}
            {st?.s === "proposal" && (
              <div className="mt-3 space-y-2 rounded-lg border border-accent/40 bg-surface p-3" role="group" aria-label="Suggested wording">
                <p className="text-xs font-medium text-accent">Suggested</p>
                <p className="break-words text-sm leading-relaxed">{st.text}</p>
                {st.novel.length > 0 && (
                  <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn" role="note">
                    New wording that was not in yours: {st.novel.slice(0, 6).map((w) => `"${w}"`).join(", ")}. Use it only if it is true.
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="min-h-11 w-full sm:w-auto" onClick={() => save(st.text)}>Use this</Button>
                  <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={() => void run(it, st.mode, { keyword: st.keyword, instruction: st.instruction })}>Try again</Button>
                  {st.mode === "custom" && <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={() => set(it.k, { s: "asking", instruction: st.instruction ?? "" })}>Change my request</Button>}
                  <Button variant="quiet" className="min-h-11 w-full sm:w-auto" onClick={() => set(it.k, undefined)}>Keep mine</Button>
                </div>
              </div>
            )}
            {st?.s === "error" && <p role="alert" className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{st.message}</p>}
            {st?.s === "asking" && (
              <div className="mt-3 space-y-2" role="group" aria-label={`Tell the AI what you want for this ${label}`}>
                <label htmlFor={`ask-${it.k}`} className="block text-xs text-ink-2">Say what you want in your own words. It only rewords what you wrote and never adds facts.</label>
                <textarea
                  id={`ask-${it.k}`}
                  value={st.instruction}
                  maxLength={300}
                  rows={2}
                  placeholder="For example: make it sound more senior and mention teamwork"
                  onChange={(ev) => set(it.k, { s: "asking", instruction: ev.target.value })}
                  className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-base leading-relaxed sm:text-sm"
                />
                <div className="flex flex-wrap gap-2" role="group" aria-label="Ideas">
                  {IDEAS.map((i) => (
                    <button key={i} type="button" onClick={() => set(it.k, { s: "asking", instruction: i })} className="min-h-11 rounded-full bg-accent-soft px-4 text-xs font-medium text-accent hover:brightness-95 sm:min-h-9 sm:px-3">
                      {i}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="min-h-11 w-full sm:w-auto" disabled={st.instruction.trim().length < 3 || !can} onClick={() => void run(it, "custom", { instruction: st.instruction.trim() })}>Rewrite it</Button>
                  <Button variant="ghost" className="min-h-11 w-full sm:w-auto" onClick={() => set(it.k, undefined)}>Cancel</Button>
                </div>
              </div>
            )}
            {st?.s === "keywords" && (
              <div className="mt-3" role="group" aria-label="Keywords you can add">
                {candidates.length ? (
                  <>
                    <p className="mb-2 text-xs text-ink-2">The job asks for these and you have them. Pick one to work into this point:</p>
                    <div className="flex flex-wrap gap-2">
                      {candidates.map((s) => (
                        <button key={s} type="button" onClick={() => void run(it, "keyword", { keyword: s })} className="min-h-11 rounded-full bg-accent-soft px-4 text-sm font-medium text-accent hover:brightness-95 sm:min-h-9 sm:px-3">
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-ink-2">Every keyword from the job that you have is already in this point.</p>
                )}
              </div>
            )}
            {!st || st.s === "error" || st.s === "keywords" || busy ? (
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Change this ${label}: ${short(it.text)}`}>
                {it.helpers && can && (
                  <>
                    <Button variant="ghost" className={btn} disabled={busy} aria-label={`Make shorter: ${short(it.text)}`} onClick={() => void run(it, "shorten")}>
                      {busy && st.mode === "shorten" ? "Working…" : "Shorter"}
                    </Button>
                    <Button variant="ghost" className={btn} disabled={busy} aria-label={`Stronger opening verb: ${short(it.text)}`} onClick={() => void run(it, "stronger")}>
                      {busy && st.mode === "stronger" ? "Working…" : "Stronger verb"}
                    </Button>
                    <Button variant="ghost" className={btn} disabled={busy} aria-expanded={st?.s === "keywords"} aria-label={`Add a keyword: ${short(it.text)}`} onClick={() => set(it.k, st?.s === "keywords" ? undefined : { s: "keywords" })}>
                      {busy && st.mode === "keyword" ? "Working…" : "Add keyword"}
                    </Button>
                  </>
                )}
                {can && (
                  <Button variant="ghost" className={btn} disabled={busy} aria-label={`Ask the AI to rewrite: ${short(it.text)}`} onClick={() => set(it.k, { s: "asking", instruction: "" })}>
                    {busy && st.mode === "custom" ? "Working…" : "Ask the AI…"}
                  </Button>
                )}
                <Button variant="quiet" className={btn} disabled={busy} aria-label={`Edit by hand: ${short(it.text)}`} onClick={() => set(it.k, { s: "editing", text: it.text })}>
                  {it.text ? "Edit" : "Write one"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </li>
    );
  }

  return (
    <Card>
      <h2 className="font-display text-xl">Edit and improve your content</h2>
      <p className="mt-1 text-sm text-ink-2">Change one piece at a time, by hand or by telling the AI what you want. Nothing changes until you choose it. Only that piece, the job description and your skill names go to the AI, never your contact details.</p>
      <div className="mt-4 space-y-3">
        <details open className="rounded-xl border border-line">
          <summary className="cursor-pointer px-3 py-3 text-sm font-medium sm:px-4">Summary <span className="font-normal text-ink-2">(the first thing a recruiter reads)</span></summary>
          <ul className="space-y-3 px-3 pb-3 sm:px-4">{row(summaryItem)}</ul>
        </details>
        {roles.map((e, ri) => (
          <details key={e.id} open={ri === 0} className="rounded-xl border border-line">
            <summary className="cursor-pointer px-3 py-3 text-sm font-medium sm:px-4">
              {[e.role, e.company].filter(Boolean).join(" at ") || "Job"} <span className="font-normal text-ink-2">({e.bullets.length} point{e.bullets.length === 1 ? "" : "s"})</span>
            </summary>
            <ul className="space-y-3 px-3 pb-3 sm:px-4">
              {e.bullets.map((b, i) => row({ k: `${e.id}:${i}`, kind: "bullet", text: b, role: e.role, company: e.company, helpers: true, max: LIMITS.bullet, apply: (t) => setBullet(e.id, i, t) }))}
            </ul>
          </details>
        ))}
        {resume.projects.filter((p) => p.name).map((p) => (
          <details key={p.id} className="rounded-xl border border-line">
            <summary className="cursor-pointer px-3 py-3 text-sm font-medium sm:px-4">
              Project: {p.name} <span className="font-normal text-ink-2">({p.bullets.length} point{p.bullets.length === 1 ? "" : "s"})</span>
            </summary>
            <ul className="space-y-3 px-3 pb-3 sm:px-4">
              {(p.bullets.length ? p.bullets : [""]).map((b, i) => row({ k: `p-${p.id}:${i}`, kind: "project", text: b, role: p.name, company: "", helpers: true, max: LIMITS.bullet, apply: (t) => setProjectLine(p.id, i, t) }))}
            </ul>
          </details>
        ))}
      </div>
    </Card>
  );
}
